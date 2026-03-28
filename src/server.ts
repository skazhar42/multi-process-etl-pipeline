import Fastify from "fastify";
import { fork, ChildProcess } from "child_process";
import path from "path";

const app = Fastify({ logger: true });
const etlServerPort = 9000;
const serverPort = 3000;

let etlProcess: ChildProcess | null = null;


// Helper to send IPC message safely
function sendMessageToEtlServer(message: any) {
  if (etlProcess && etlProcess.connected) {
    etlProcess.send(message);
  } else {
    app.log.warn("Etl server not running");
  }
}

app.get("/health", async () => {
  return { status: "parent-ok" };
});

app.get("/etl/health", async (request, reply) => {
    try {
        const response = await fetch(`http://0.0.0.0:${etlServerPort}/health`);
        const data = await response.json();
        return data;
    } catch (err) {
        return reply.status(500).send({ error: `Failed to reach etl server with error: ${err}` });
    }
});

app.post("/etl/start-pipeline", async (request, reply) => {
    try {
        const response = await fetch(`http://0.0.0.0:${etlServerPort}/start-etl-pipeline`, {
            method: "POST",
        });
        const data = await response.json();
        return data;
    } catch (err) {
        return reply.status(500).send({ error: `Failed to reach etl server with error: ${err}` });
    }
});

app.post("/etl/ping-parent", async (request, reply) => {
    try {
        const body = request.body as any;
        const response = await fetch(`http://0.0.0.0:${etlServerPort}/ping-parent`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: body?.message ?? "Hello from parent" }),
        });
        const data = await response.json();
        return data;
    } catch (err) {  
        return reply.status(500).send({ error: `Failed to ping etl server with error: ${err}` });
    }
});

// Start etl server
app.post("/start-etl-server", async (request, reply) => {
  if (etlProcess) {
    return reply.send({ message: "ETL server already running" });
  }

  const etlPath = path.join(__dirname, "etl-server.js");

  etlProcess = fork(etlPath, [], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });

  app.log.info("Etl process started");

  // Listen for messages from etl
  etlProcess.on("message", (msg : any) => {
    app.log.info({ msg }, "Message from Etl server");

    if (msg.type === "READY") {
      app.log.info("Etl server is ready");
    }

    if (msg.type === "STOPPED") {
      app.log.info("Etl server stopped");
    }

    if (msg.type === "PING_PARENT") {
      app.log.info("Etl server says: " + msg.message);
    }
  });

  etlProcess.on("exit", (code) => {
    app.log.info(`Etl server exited with code ${code}`);
    etlProcess = null;
  });

  return reply.send({ message: "Etl server started" });
});

// Stop etl server
app.post("/stop-etl-server", async (request, reply) => {
  if (!etlProcess) {
    return reply.send({ message: "Etl pipeline not running" });
  }

  sendMessageToEtlServer({ type: "SHUTDOWN" });

  return reply.send({ message: "Shutdown signal sent to etl server" });
});

// Example additional IPC trigger
app.post("/ping-etl-server", async (request, reply) => {
  sendMessageToEtlServer({ type: "PING", timestamp: Date.now() });

  return reply.send({ message: "Ping sent" });
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