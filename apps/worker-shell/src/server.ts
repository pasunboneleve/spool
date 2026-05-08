import { createInitialState, parseAgentEvent, project, reduceEvent, type CoreState } from "@spool/core";
import { Hono } from "hono";
import { createMockAgent } from "./mock-agent";
import { ProjectionHub } from "./websocket";

const app = new Hono();
const hub = new ProjectionHub();
let state: CoreState = createInitialState();
const mockAbort = new AbortController();
let shuttingDown = false;

app.get("/health", (c) =>
  c.json({
    ok: true,
    clients: hub.size,
    last_seq: hub.snapshot?.last_seq ?? 0,
    phase: hub.snapshot?.phase ?? "idle"
  })
);

app.get("/", (c) => c.text("spool worker-shell is running. Open the frontend at http://localhost:5173."));

const server = Bun.serve({
  port: Number(process.env.PORT ?? 8787),
  fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(request);
      return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }
    return app.fetch(request);
  },
  websocket: {
    open(ws) {
      hub.connect(ws);
      console.log(`[worker] client connected (${hub.size})`);
    },
    message(ws, message) {
      if (message === "snapshot" && hub.snapshot) {
        ws.send(JSON.stringify({ type: "projection", projection: hub.snapshot }));
      }
    },
    close(ws) {
      hub.disconnect(ws);
      console.log(`[worker] client disconnected (${hub.size})`);
    }
  }
});

console.log(`[worker] listening on http://localhost:${server.port}`);
installShutdownHandlers();
void pumpMockAgent();

async function pumpMockAgent() {
  try {
    for await (const event of createMockAgent(mockAbort.signal)) {
      const parsed = parseAgentEvent(event);
      state = reduceEvent(state, parsed);
      hub.broadcastProjection(project(state));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] mock stream failed: ${message}`);
    hub.broadcastError(message);
  }
}

function installShutdownHandlers() {
  process.on("SIGINT", () => {
    shutdown("SIGINT").finally(() => process.exit(130));
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM").finally(() => process.exit(143));
  });
}

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] shutting down (${signal})`);
  mockAbort.abort();
  hub.closeAll();
  server.stop(true);
  await Bun.sleep(25);
}
