import {
  buildArticleIndex,
  createEventCore,
  parseArticleMarkdown,
  parseJsonlEvents,
  resolveDefaultArticle,
  type AgentEvent,
  type Article,
  type ArticleIndexItem,
  type EventCore,
  type SiteConfig
} from "@spool/core";
import {
  JsonlSink,
  MemorySink,
  createEmitter,
  createId,
  createRequestContext,
  failureDrills,
  runFailureDrill,
  type FailureDrill,
  type ObservabilityEvent
} from "@spool/observability";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMockAgent } from "./mock-agent";
import { ObservabilityHub, ProjectionHub, type ClientData } from "./websocket";

const app = new Hono();
let shuttingDown = false;
let eventsReceived = 0;
let lastPerfLogAt = performance.now();
const articlesDir = new URL("../../../content/articles/", import.meta.url);
const eventsDir = new URL("../../../content/events/", import.meta.url);
const siteConfigFile = new URL("../../../content/site.json", import.meta.url);
const runners = new Map<string, StreamRunner>();
const pendingRunners = new Map<string, Promise<StreamRunner>>();
const closedSockets = new WeakSet<object>();
const memorySink = new MemorySink(80);
const jsonlSink = new JsonlSink(300);
const observabilityHub = new ObservabilityHub(() => memorySink.list());
const emitter = createEmitter([
  memorySink,
  jsonlSink,
  {
    write(event: ObservabilityEvent) {
      observabilityHub.broadcast(event);
      if (process.env.SPOOL_OBS_STDOUT === "1") {
        console.log(JSON.stringify(event));
      }
    }
  }
]);

app.use("*", cors());
app.use("*", async (c, next) => {
  const context = createRequestContext();
  const path = new URL(c.req.url).pathname;
  emitter.emit("platform_request_started", {
    ...context,
    component: "worker-shell",
    payload: { method: c.req.method, path }
  });
  try {
    await next();
    emitter.emit("platform_request_finished", {
      ...context,
      component: "worker-shell",
      payload: { method: c.req.method, path, status: c.res.status }
    });
  } catch (error) {
    emitter.emit("platform_request_failed", {
      ...context,
      component: "worker-shell",
      payload: { method: c.req.method, path, error: formatError(error) }
    });
    throw error;
  }
});

app.get("/health", (c) =>
  c.json({
    ok: true,
    streams: [...runners].map(([sourceId, runner]) => ({
      sourceId,
      clients: runner.hub.size,
      last_seq: runner.hub.snapshot?.last_seq ?? 0,
      phase: runner.hub.snapshot?.phase ?? "idle"
    })),
    observability_events: memorySink.list().length
  })
);

app.get("/", (c) => c.text("spool worker-shell is running. Open the frontend at http://localhost:5173."));

app.get("/site", async (c) => {
  try {
    const index = await loadArticleIndex();
    const config = await loadSiteConfig();
    return c.json({
      config,
      articles: index,
      default_article: resolveDefaultArticle(index, config)
    });
  } catch (error) {
    return c.json({ error: formatError(error) }, 500);
  }
});

app.get("/articles", async (c) => {
  try {
    return c.json(await loadArticleIndex());
  } catch (error) {
    return c.json({ error: formatError(error) }, 500);
  }
});

app.get("/observability/events", (c) => c.json(memorySink.list()));

app.get("/observability/jsonl", (c) => c.text(jsonlSink.list().join("\n")));

app.post("/drills/:name", (c) => {
  const drill = c.req.param("name");
  if (!failureDrills.includes(drill as FailureDrill)) {
    return c.json({ error: `unknown drill: ${drill}` }, 404);
  }
  return c.json(runFailureDrill(drill as FailureDrill, emitter));
});

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
      const sessionId = createId("ws");
      const correlationId = createId("corr");
      const upgraded = (
        server as unknown as { upgrade(request: Request, options: { data: ClientData }): boolean }
      ).upgrade(request, { data: { kind: "projection", sourceId, sessionId, correlationId } });
      return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }
    if (url.pathname === "/observability/ws") {
      const upgraded = (
        server as unknown as { upgrade(request: Request, options: { data: ClientData }): boolean }
      ).upgrade(request, { data: { kind: "observability", sessionId: createId("obs_ws"), correlationId: createId("corr") } });
      return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }
    return app.fetch(request);
  },
  websocket: {
    open(ws) {
      const data = clientData(ws);
      if (data.kind === "observability") {
        observabilityHub.connect(ws);
        emitter.emit("websocket_connected", {
          session_id: data.sessionId,
          correlation_id: data.correlationId,
          component: "observability-stream",
          payload: { path: "/observability/ws" }
        });
        return;
      }
      const sourceId = data.sourceId;
      getRunner(sourceId)
        .then((runner) => {
          if (closedSockets.has(ws)) return;
          runner.hub.connect(ws);
          runner.start();
          emitter.emit("websocket_connected", {
            run_id: sourceId,
            session_id: data.sessionId,
            correlation_id: data.correlationId,
            component: "worker-shell",
            payload: { sourceId, clients: runner.hub.size }
          });
          logVerbose(`[worker] client connected to ${sourceId} (${runner.hub.size})`);
        })
        .catch((error) => safeSend(ws, JSON.stringify({ type: "error", message: formatError(error) })));
    },
    message(ws, message) {
      const data = clientData(ws);
      if (data.kind === "projection" && message === "snapshot") {
        getRunner(data.sourceId)
          .then((runner) => {
            if (!closedSockets.has(ws) && runner.hub.snapshot) {
              ws.send(JSON.stringify({ type: "projection", projection: runner.hub.snapshot }));
            }
          })
          .catch((error) => safeSend(ws, JSON.stringify({ type: "error", message: formatError(error) })));
      }
    },
    close(ws) {
      const data = clientData(ws);
      closedSockets.add(ws);
      if (data.kind === "observability") {
        observabilityHub.disconnect(ws);
        emitter.emit("websocket_closed", {
          session_id: data.sessionId,
          correlation_id: data.correlationId,
          component: "observability-stream",
          payload: { path: "/observability/ws" }
        });
        return;
      }
      const sourceId = data.sourceId;
      getRunner(sourceId)
        .then((runner) => {
          runner.hub.disconnect(ws);
          emitter.emit("websocket_closed", {
            run_id: sourceId,
            session_id: data.sessionId,
            correlation_id: data.correlationId,
            component: "worker-shell",
            payload: { sourceId, clients: runner.hub.size }
          });
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
  readonly hub = new ProjectionHub(66, (projection, bytes) => {
    emitter.emit("projection_broadcast", {
      run_id: this.sourceId,
      correlation_id: this.correlationId,
      component: "projection-hub",
      payload: { sourceId: this.sourceId, seq: projection.last_seq, phase: projection.phase }
    });
    emitter.emit("projection_payload_measured", {
      run_id: this.sourceId,
      correlation_id: this.correlationId,
      component: "projection-hub",
      payload: { sourceId: this.sourceId, bytes }
    });
  });
  private readonly core: EventCore = createEventCore();
  private readonly abort = new AbortController();
  private readonly correlationId = createId("corr");
  private started = false;

  constructor(
    readonly sourceId: string,
    private readonly events: AgentEvent[]
  ) {}

  start() {
    if (this.started) return;
    this.started = true;
    emitter.emit("event_source_started", {
      run_id: this.sourceId,
      correlation_id: this.correlationId,
      component: "event-source",
      payload: { sourceId: this.sourceId, event_count: this.events.length }
    });
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
      emitter.emit("event_source_failed", {
        run_id: this.sourceId,
        correlation_id: this.correlationId,
        component: "event-source",
        payload: { sourceId: this.sourceId, error: message }
      });
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

async function loadArticleIndex(): Promise<ArticleIndexItem[]> {
  const articleFiles = new Bun.Glob("*.md").scan({ cwd: articlesDir.pathname });
  const articles: Article[] = [];
  for await (const fileName of articleFiles) {
    const id = fileName.replace(/\.md$/, "");
    articles.push(await loadArticle(id));
  }
  return buildArticleIndex(articles);
}

async function loadSiteConfig(): Promise<SiteConfig> {
  const file = Bun.file(siteConfigFile);
  if (!(await file.exists())) return {};
  const parsed = JSON.parse(await file.text()) as SiteConfig;
  return parsed;
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

function clientData(ws: { data?: unknown }): ClientData {
  const data = ws.data as ClientData | undefined;
  return data ?? { kind: "projection", sourceId: "sample-agent-run", sessionId: createId("ws"), correlationId: createId("corr") };
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
