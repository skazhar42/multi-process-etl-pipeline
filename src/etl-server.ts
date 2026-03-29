
import Fastify from "fastify";
import { etlPipeline } from "./etl-pipeline";
import dotenv from "dotenv";

dotenv.config();

export const etlServer = Fastify({ logger: true });
const etlServerPort = process.env.ETL_SERVER_PORT ? parseInt(process.env.ETL_SERVER_PORT) : 9000;


let serverStarted = false;
let pipelineRunning = false;

type messages = "HEALTH" | "START_PIPELINE" | "STOP_SERVER" | "PING" | "START_SERVER" | "PIPELINE_STATUS";

type messageFromServer = {
  id: string;
  type: messages;
  message: string;
}

type messageToServer = {
  id: string;
  type: messages;
  pid: number;
  message: string;
}

const startEtlPipeline = () => {
  if(pipelineRunning) {
    return "ETL pipeline already running !!" ;
  }
  pipelineRunning = true;
  etlPipeline(); // run ETL in background
  return "ETL pipeline started !!";
};

async function startEtlServer() {
  try {
    await etlServer.listen({ port: etlServerPort, host: "0.0.0.0" });
    etlServer.log.info("ETL server running on port : "+ etlServerPort);
    serverStarted = true;
  } catch (err) {
    etlServer.log.error(err);
    process.exit(1);
  }
}

async function shutdownEtl() {
  if (!serverStarted) return;
  await etlServer.close();
  process.exit(0);
}

const sendMessageToParent = (msg: messageFromServer, text: string) => {
  if (process.send) {
    const messageToSend: messageToServer = {
      id: msg.id,
      type: msg.type,
      pid: process.pid,
      message: text,
    }
    process.send(messageToSend);
  }
}

// Listen for IPC messages from parent
process.on("message", async (msg: messageFromServer) => {
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
    case "START_SERVER":
      sendMessageToParent(msg, "ETL server has been started !!");
      break;
    case "PIPELINE_STATUS":
      sendMessageToParent(msg, pipelineRunning ? "ETL pipeline is running" : "ETL pipeline is not running");
      break;
    default:
      etlServer.log.warn("Unknown message type");
  }
});

// Handle OS signals (important for production)
process.on("SIGTERM", shutdownEtl);
process.on("SIGINT", shutdownEtl);

startEtlServer();