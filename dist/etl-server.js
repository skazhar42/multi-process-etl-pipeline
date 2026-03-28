"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.etlServer = void 0;
const fastify_1 = __importDefault(require("fastify"));
const etl_pipeline_1 = require("./etl-pipeline");
exports.etlServer = (0, fastify_1.default)({ logger: true });
const etlServerPort = 9000;
let serverStarted = false;
let pipelineRunning = false;
exports.etlServer.get("/health", async () => {
    return { status: "etl-server-ok" };
});
exports.etlServer.post("/start-etl", async () => {
    if (pipelineRunning) {
        return { status: "ETL pipeline already running !!" };
    }
    pipelineRunning = true;
    (0, etl_pipeline_1.etlPipeline)(); // run ETL in background
    return { status: "ETL pipeline started !!" };
});
// Endpoint for etl to ping parent via IPC with message body
exports.etlServer.post("/ping-parent", async (request, reply) => {
    const body = request.body;
    if (process.send) {
        process.send({
            type: "PING_PARENT",
            pid: process.pid,
            message: body?.message ?? "No message provided",
            timestamp: Date.now(),
        });
    }
    return reply.send({
        status: "sent-to-parent",
    });
});
async function startEtlServer() {
    try {
        await exports.etlServer.listen({ port: etlServerPort, host: "0.0.0.0" });
        serverStarted = true;
        // Notify parent that etl is ready
        if (process.send) {
            process.send({
                type: "READY",
                pid: process.pid,
                port: etlServerPort,
            });
        }
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
    if (process.send) {
        process.send({
            type: "STOPPED",
            pid: process.pid,
        });
    }
    process.exit(0);
}
// Listen for IPC messages from parent
process.on("message", async (msg) => {
    exports.etlServer.log.info({ msg }, "Message from parent");
    switch (msg.type) {
        case "PING":
            if (process.send) {
                process.send({
                    type: "PONG",
                    timestamp: Date.now(),
                });
            }
            break;
        case "SHUTDOWN":
            await shutdownEtl();
            break;
        default:
            exports.etlServer.log.warn("Unknown message type");
    }
});
// Handle OS signals (important for production)
process.on("SIGTERM", shutdownEtl);
process.on("SIGINT", shutdownEtl);
startEtlServer();
