import { createEventCore, parseArticleMarkdown, parseJsonlEvents, type AgentEvent, type Article, type EventCore } from "@spool/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMockAgent } from "./mock-agent";
import { ProjectionHub, type ClientData } from "./websocket";

const app = new Hono();
let shuttingDown = false;
let eventsReceived = 0;
let lastPerfLogAt = performance.now();
const articlesDir = new URL("../../../content/articles/", import.meta.url);
const eventsDir = new URL("../../../content/events/", import.meta.url);
const runners = new Map<string, StreamRunner>();
const pendingRunners = new Map<string, Promise<StreamRunner>>();
const closedSockets = new WeakSet<object>();

app.use("*", cors());

app.get("/health", (c) =>
  c.json({
    ok: true,
    streams: [...runners].map(([sourceId, runner]) => ({
      sourceId,
      clients: runner.hub.size,
      last_seq: runner.hub.snapshot?.last_seq ?? 0,
      phase: runner.hub.snapshot?.phase ?? "idle"
    }))
  })
);

app.get("/", (c) => c.text("spool worker-shell is running. Open the frontend at http://localhost:5173."));

app.get("/articles/:id", async (c) => {
  try {
    return c.json(await loadArticle(c.req.param("id")));
  } catch (error) {
    return c.json({ error: formatError(error) }, 404);
  }
});

const server = Bun.serve({
  port: Number(process.env.PORT ?? 8787),
  fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const sourceId = url.searchParams.get("source") ?? "sample-agent-run";
      const upgraded = (
        server as unknown as { upgrade(request: Request, options: { data: ClientData }): boolean }
      ).upgrade(request, { data: { sourceId } });
      return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }
    return app.fetch(request);
  },
  websocket: {
    open(ws) {
      const sourceId = sourceFor(ws);
      getRunner(sourceId)
        .then((runner) => {
          if (closedSockets.has(ws)) return;
          runner.hub.connect(ws);
          runner.start();
          logVerbose(`[worker] client connected to ${sourceId} (${runner.hub.size})`);
        })
        .catch((error) => safeSend(ws, JSON.stringify({ type: "error", message: formatError(error) })));
    },
    message(ws, message) {
      if (message === "snapshot") {
        getRunner(sourceFor(ws))
          .then((runner) => {
            if (!closedSockets.has(ws) && runner.hub.snapshot) {
              ws.send(JSON.stringify({ type: "projection", projection: runner.hub.snapshot }));
            }
          })
          .catch((error) => safeSend(ws, JSON.stringify({ type: "error", message: formatError(error) })));
      }
    },
    close(ws) {
      const sourceId = sourceFor(ws);
      closedSockets.add(ws);
      getRunner(sourceId)
        .then((runner) => {
          runner.hub.disconnect(ws);
          logVerbose(`[worker] client disconnected from ${sourceId} (${runner.hub.size})`);
        })
        .catch(() => undefined);
    }
  }
});

console.log(`[worker] listening on http://localhost:${server.port}`);
installShutdownHandlers();
setInterval(logPerf, 5_000);

class StreamRunner {
  readonly hub = new ProjectionHub();
  private readonly core: EventCore = createEventCore();
  private readonly abort = new AbortController();
  private started = false;

  constructor(
    readonly sourceId: string,
    private readonly events: AgentEvent[]
  ) {}

  start() {
    if (this.started) return;
    this.started = true;
    void this.pump();
  }

  stop() {
    this.abort.abort();
    this.hub.closeAll();
  }

  private async pump() {
    try {
      for await (const event of createMockAgent(this.events, this.abort.signal)) {
        eventsReceived += 1;
        this.hub.broadcastProjection(this.core.reduce(event));
      }
    } catch (error) {
      const message = formatError(error);
      console.error(`[worker] ${this.sourceId} stream failed: ${message}`);
      this.hub.broadcastError(message);
    }
  }
}

async function getRunner(sourceId: string) {
  const existing = runners.get(sourceId);
  if (existing) return existing;
  const pending = pendingRunners.get(sourceId);
  if (pending) return pending;

  const created = loadEventSource(sourceId)
    .then((events) => {
      const runner = new StreamRunner(sourceId, events);
      runners.set(sourceId, runner);
      pendingRunners.delete(sourceId);
      return runner;
    })
    .catch((error) => {
      pendingRunners.delete(sourceId);
      throw error;
    });
  pendingRunners.set(sourceId, created);
  return created;
}

async function loadArticle(id: string): Promise<Article> {
  const safeId = parseContentId(id);
  const file = Bun.file(new URL(`${safeId}.md`, articlesDir));
  if (!(await file.exists())) throw new Error(`article not found: ${safeId}`);
  return parseArticleMarkdown(await file.text());
}

async function loadEventSource(id: string) {
  const safeId = parseContentId(id);
  const file = Bun.file(new URL(`${safeId}.jsonl`, eventsDir));
  if (!(await file.exists())) throw new Error(`event source not found: ${safeId}`);
  return parseJsonlEvents(await file.text());
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
  for (const runner of runners.values()) runner.stop();
  server.stop(true);
  await Bun.sleep(25);
}

function logPerf() {
  const now = performance.now();
  const elapsedSeconds = Math.max((now - lastPerfLogAt) / 1_000, 0.001);
  const stats = takeHubStats();
  console.info(
    `[worker:perf] events=${(eventsReceived / elapsedSeconds).toFixed(1)}/s broadcast=${(
      stats.broadcasts / elapsedSeconds
    ).toFixed(1)}/s payload=${Math.round(stats.bytes / elapsedSeconds)}B/s clients=${stats.clients}`
  );
  eventsReceived = 0;
  lastPerfLogAt = now;
}

function takeHubStats() {
  let broadcasts = 0;
  let bytes = 0;
  let clients = 0;
  for (const runner of runners.values()) {
    const stats = runner.hub.takeStats();
    broadcasts += stats.broadcasts;
    bytes += stats.bytes;
    clients += runner.hub.size;
  }
  return { broadcasts, bytes, clients };
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sourceFor(ws: { data?: unknown }) {
  const data = ws.data as ClientData | undefined;
  return data?.sourceId ?? "sample-agent-run";
}

function parseContentId(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`invalid content id: ${id}`);
  }
  return id;
}

function safeSend(ws: { send(message: string): unknown }, message: string) {
  if (closedSockets.has(ws)) return;
  try {
    ws.send(message);
  } catch {
    closedSockets.add(ws);
  }
}

function logVerbose(message: string) {
  if (process.env.SPOOL_VERBOSE === "1") {
    console.log(message);
  }
}
