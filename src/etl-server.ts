
import Fastify from "fastify";
import { etlPipeline } from "./etl-pipeline";

export const etlServer = Fastify({ logger: true });
const etlServerPort = 9000;

let serverStarted = false;
let pipelineRunning = false;

etlServer.get("/health", async () => {
  return { status: "etl-server-ok" };
});

etlServer.post("/start-etl-pipeline", async () => {
  if(pipelineRunning) {
    return { status: "ETL pipeline already running !!" };
  }
  pipelineRunning = true;
  etlPipeline(); // run ETL in background
  return { status: "ETL pipeline started !!" };
});

// Endpoint for etl to ping parent via IPC with message body
etlServer.post("/ping-parent", async (request, reply) => {
  const body = request.body as any;

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
    await etlServer.listen({ port: etlServerPort, host: "0.0.0.0" });
    etlServer.log.info("ETL server running on port : "+ etlServerPort);
    serverStarted = true;

    // Notify parent that etl is ready
    if (process.send) {
      process.send({
        type: "READY",
        pid: process.pid,
        port: etlServerPort,
      });
    }
  } catch (err) {
    etlServer.log.error(err);
    process.exit(1);
  }
}

async function shutdownEtl() {
  if (!serverStarted) return;

  await etlServer.close();

  if (process.send) {
    process.send({
      type: "STOPPED",
      pid: process.pid,
    });
  }

  process.exit(0);
}

// Listen for IPC messages from parent
process.on("message", async (msg: any) => {
  etlServer.log.info({ msg }, "Message from parent");

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
      etlServer.log.warn("Unknown message type");
  }
});

// Handle OS signals (important for production)
process.on("SIGTERM", shutdownEtl);
process.on("SIGINT", shutdownEtl);

startEtlServer();