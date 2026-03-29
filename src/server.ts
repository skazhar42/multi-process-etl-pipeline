import Fastify from "fastify";
import { fork, ChildProcess } from "child_process";
import path from "path";
import { getTsid } from 'tsid-ts';
import dotenv from "dotenv";

dotenv.config();

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

const pendingMessages = new Map<string, messageFromServer>();
const pendingResponses = new Map<string, messageToServer>();


const app = Fastify({ logger: true });
const serverPort = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : 3000;

let etlProcess: ChildProcess | null = null;

// Helper to send IPC message safely
function sendMessageToEtlServer(type: messages, message: string) {
  if (etlProcess && etlProcess.connected) {
    const id = getTsid().toString();
    const msg: messageFromServer = { id, type, message };
    etlProcess.send(msg);
    pendingMessages.set(id, msg);
    return id;
  } else {
    app.log.warn("Etl server not running");
    return undefined;
  }
}

function waitForResponse(
  id: string,
  timeoutMs = 5000
): Promise<messageToServer | undefined> {
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

const generateHttpResponse = async (id: string | undefined, reply: any) => {
  if (!id) {
      return reply.status(500).send({ error: "Etl server not running" });
    }
    const response = await waitForResponse(id);
    if (!response) {
      return reply.status(500).send({ error: "No response from etl server" });
    }
    return reply.send({ status: response.message });
}

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

app.get("/etl/pipeline-status", async (request, reply) => {
    const id = sendMessageToEtlServer("PIPELINE_STATUS", "Check Etl pipeline status");
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

  const etlPath = path.join(__dirname, "etl-server.js");

  etlProcess = fork(etlPath, [], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });

  app.log.info("Etl process started");

  // Listen for messages from etl
  etlProcess.on("message", (msg : messageToServer) => {
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

  const id = sendMessageToEtlServer("START_SERVER", "Are you ready Etl server ?");
  const response = generateHttpResponse(id, reply);

  return response;
});

async function startParent() {
  try {
    await app.listen({ port: serverPort, host: "0.0.0.0" });
    app.log.info("Parent server running on port : "+ serverPort);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

startParent();