"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.etlServer = void 0;
const fastify_1 = __importDefault(require("fastify"));
const etl_pipeline_1 = require("./etl-pipeline");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.etlServer = (0, fastify_1.default)({ logger: true });
const etlServerPort = process.env.ETL_SERVER_PORT ? parseInt(process.env.ETL_SERVER_PORT) : 9000;
let serverStarted = false;
let pipelineRunning = false;
const startEtlPipeline = () => {
    if (pipelineRunning) {
        return "ETL pipeline already running !!";
    }
    pipelineRunning = true;
    (0, etl_pipeline_1.etlPipeline)(); // run ETL in background
    return "ETL pipeline started !!";
};
async function startEtlServer() {
    try {
        await exports.etlServer.listen({ port: etlServerPort, host: "0.0.0.0" });
        exports.etlServer.log.info("ETL server running on port : " + etlServerPort);
        serverStarted = true;
    }
    catch (err) {
        exports.etlServer.log.error(err);
        process.exit(1);
    }
}
async function shutdownEtl() {
    if (!serverStarted)
        return;
    await exports.etlServer.close();
    process.exit(0);
}
const sendMessageToParent = (msg, text) => {
    if (process.send) {
        const messageToSend = {
            id: msg.id,
            type: msg.type,
            pid: process.pid,
            message: text,
        };
        process.send(messageToSend);
    }
};
// Listen for IPC messages from parent
process.on("message", async (msg) => {
    switch (msg.type) {
        case "PING":
            sendMessageToParent(msg, "PONG from ETL server");
            break;
        case "STOP_SERVER":
            sendMessageToParent(msg, "ETL server shutting down");
            await shutdownEtl();
            break;
        case "HEALTH":
            sendMessageToParent(msg, "ETL server healthy");
            break;
        case "START_PIPELINE":
            const res = startEtlPipeline();
            sendMessageToParent(msg, res);
            break;
        default:
            exports.etlServer.log.warn("Unknown message type");
    }
});
// Handle OS signals (important for production)
process.on("SIGTERM", shutdownEtl);
process.on("SIGINT", shutdownEtl);
startEtlServer();
