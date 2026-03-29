"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const tsid_ts_1 = require("tsid-ts");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pendingMessages = new Map();
const pendingResponses = new Map();
const app = (0, fastify_1.default)({ logger: true });
const serverPort = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : 3000;
let etlProcess = null;
// Helper to send IPC message safely
function sendMessageToEtlServer(type, message) {
    if (etlProcess && etlProcess.connected) {
        const id = (0, tsid_ts_1.getTsid)().toString();
        const msg = { id, type, message };
        etlProcess.send(msg);
        pendingMessages.set(id, msg);
        return id;
    }
    else {
        app.log.warn("Etl server not running");
        return undefined;
    }
}
function waitForResponse(id, timeoutMs = 5000) {
    return new Promise((resolve) => {
        function cleanup() {
            clearInterval(timer);
            clearTimeout(timeout);
            pendingMessages.delete(id);
            pendingResponses.delete(id);
        }
        const intervalMs = 50;
        const timer = setInterval(() => {
            const response = pendingResponses.get(id);
            if (response) {
                cleanup();
                resolve(response);
            }
        }, intervalMs);
        const timeout = setTimeout(() => {
            cleanup();
            resolve(undefined);
        }, timeoutMs);
    });
}
const generateHttpResponse = async (id, reply) => {
    if (!id) {
        return reply.status(500).send({ error: "Etl server not running" });
    }
    const response = await waitForResponse(id);
    if (!response) {
        return reply.status(500).send({ error: "No response from etl server" });
    }
    return reply.send({ status: response.message });
};
app.get("/health", async () => {
    return { status: "parent-ok" };
});
app.get("/etl/health", async (request, reply) => {
    const id = sendMessageToEtlServer("HEALTH", "Checking Etl server health");
    return generateHttpResponse(id, reply);
});
app.post("/etl/start-pipeline", async (request, reply) => {
    const id = sendMessageToEtlServer("START_PIPELINE", "Start Etl pipeline");
    return generateHttpResponse(id, reply);
});
// Stop etl server
app.post("/etl/stop-server", async (request, reply) => {
    const id = sendMessageToEtlServer("STOP_SERVER", "Shutting down Etl server");
    return generateHttpResponse(id, reply);
});
// Example additional IPC trigger
app.post("/etl/ping-server", async (request, reply) => {
    const id = sendMessageToEtlServer("PING", "Hello Etl server, this is parent!");
    return generateHttpResponse(id, reply);
});
// Start etl server
app.post("/etl/start-server", async (request, reply) => {
    if (etlProcess) {
        return reply.send({ message: "ETL server already running" });
    }
    const etlPath = path_1.default.join(__dirname, "etl-server.js");
    etlProcess = (0, child_process_1.fork)(etlPath, [], {
        stdio: ["inherit", "inherit", "inherit", "ipc"],
    });
    app.log.info("Etl process started");
    // Listen for messages from etl
    etlProcess.on("message", (msg) => {
        app.log.info({ msg });
        const pending = pendingMessages.get(msg.id);
        if (pending) {
            pendingResponses.set(msg.id, msg);
        }
    });
    etlProcess.on("exit", (code) => {
        app.log.info(`Etl server exited with code ${code}`);
        etlProcess = null;
    });
    const id = sendMessageToEtlServer("READY", "Are you ready Etl server ?");
    const response = generateHttpResponse(id, reply);
    return response;
});
async function startParent() {
    try {
        await app.listen({ port: serverPort, host: "0.0.0.0" });
        app.log.info("Parent server running on port : " + serverPort);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
startParent();
