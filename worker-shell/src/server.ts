import { Hono } from "hono";
import init, { Engine } from "../../app/generated/rust-core/rust_core.js";
import type { ServerWebSocket } from "bun";

type CoreResponse = {
  ok: boolean;
  error?: string;
  projection: unknown;
};

const app = new Hono();
const clients = new Set<ServerWebSocket<unknown>>();
const engineReady = createEngine();
let lastProjection: unknown = null;

app.get("/health", async (c) => {
  const engine = await engineReady;
  const snapshot = JSON.parse(engine.snapshot()) as CoreResponse;
  return c.json({
    ok: true,
    clients: clients.size,
    hasProjection: snapshot.projection != null
  });
});

app.get("/", (c) =>
  c.text("spool worker-shell is running. Open the frontend dev server at http://localhost:5173.")
);

const server = Bun.serve({
  port: Number(process.env.PORT ?? 8787),
  async fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(request);
      return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }
    return app.fetch(request);
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      if (lastProjection) {
        ws.send(JSON.stringify({ type: "projection", projection: lastProjection }));
      }
      console.log(`[worker] client connected (${clients.size})`);
    },
    message(ws, message) {
      if (message === "snapshot" && lastProjection) {
        ws.send(JSON.stringify({ type: "projection", projection: lastProjection }));
      }
    },
    close(ws) {
      clients.delete(ws);
      console.log(`[worker] client disconnected (${clients.size})`);
    }
  }
});

console.log(`[worker] listening on http://localhost:${server.port}`);

const engine = await engineReady;
startMockAgent(engine);

async function createEngine() {
  const wasmUrl = new URL("../../app/generated/rust-core/rust_core_bg.wasm", import.meta.url);
  await init(wasmUrl);
  console.log("[worker] rust-core wasm loaded");
  return new Engine();
}

function startMockAgent(engine: Engine) {
  const proc = Bun.spawn(["cargo", "run", "-q", "-p", "mock-agent"], {
    cwd: new URL("../..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe"
  });

  console.log("[worker] mock-agent started");
  readLines(proc.stdout, (line) => ingestLine(engine, line));
  readLines(proc.stderr, (line) => console.error(`[mock-agent] ${line}`));

  proc.exited.then((code) => {
    console.error(`[worker] mock-agent exited with code ${code}`);
  });

  const stop = () => proc.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

async function readLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) onLine(trimmed);
    }
  }
  const finalLine = buffer.trim();
  if (finalLine.length > 0) {
    onLine(finalLine);
  }
}

function ingestLine(engine: Engine, line: string) {
  const response = JSON.parse(engine.ingest(line)) as CoreResponse;
  if (!response.ok) {
    console.error(`[worker] core rejected event: ${response.error ?? "unknown error"}`);
  }
  lastProjection = response.projection;
  broadcast({ type: "projection", projection: response.projection });
}

function broadcast(message: unknown) {
  const encoded = JSON.stringify(message);
  for (const client of clients) {
    client.send(encoded);
  }
}
