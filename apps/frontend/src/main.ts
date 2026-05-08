import type { Article, ArticleIndexItem, Projection, SiteConfig } from "@spool/core";
import type { ObservabilityEvent } from "@spool/observability";
import "./styles.css";
import { renderArticle, type RenderedArticle } from "./article-renderer";
import { registerDefaultVisualisations } from "./viz-registry";

type WorkerFrame =
  | { type: "projection"; projection: Projection }
  | { type: "observability"; event: ObservabilityEvent }
  | { type: "error"; message: string }
  | { type: "hello"; clients: number };

type SitePayload = {
  config: SiteConfig;
  articles: ArticleIndexItem[];
  default_article: string;
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("app root missing");
const appRoot = app;

const workerHttpUrl = import.meta.env.VITE_WORKER_HTTP_URL ?? `http://${location.hostname}:8787`;
const requestedArticleId = new URLSearchParams(location.search).get("article");
let renderedArticle: RenderedArticle | null = null;
const latestProjections = new Map<string, Projection>();
let latestObservability: ObservabilityEvent[] = [];
let renderQueued = false;
let receivedMessages = 0;
let receivedBytes = 0;
let renderCalls = 0;
let totalRenderMs = 0;
let lastPerfLogAt = performance.now();
const connectionStates = new Map<string, "connecting" | "live" | "reconnecting" | "error">();

registerDefaultVisualisations();
void boot();

if (import.meta.env.DEV) {
  window.setInterval(logPerf, 5_000);
}

async function boot() {
  setLoading();
  try {
    const site = await loadSite();
    const articleId = requestedArticleId ?? site.default_article;
    const article = await loadArticle(articleId);
    renderedArticle = renderArticle(appRoot, article, {
      articles: site.articles,
      activeArticleId: article.id,
      defaultArticleId: site.default_article
    });
    renderedArticle.update(latestProjections);
    renderedArticle.updateObservability(latestObservability);
    for (const sourceId of articleEventSources(article)) {
      connect(sourceId);
    }
    connectObservability();
  } catch (error) {
    appRoot.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function loadSite(): Promise<SitePayload> {
  const response = await fetch(`${workerHttpUrl}/site`);
  if (!response.ok) throw new Error(`failed to load site: ${response.status}`);
  return (await response.json()) as SitePayload;
}

async function loadArticle(id: string): Promise<Article> {
  const response = await fetch(`${workerHttpUrl}/articles/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`failed to load article ${id}: ${response.status}`);
  return (await response.json()) as Article;
}

function connect(sourceId: string) {
  setConnection(sourceId, "connecting");
  const workerUrl = import.meta.env.VITE_WORKER_WS_URL ?? `ws://${location.hostname}:8787/ws`;
  const ws = new WebSocket(`${workerUrl}?source=${encodeURIComponent(sourceId)}`);

  ws.addEventListener("open", () => {
    setConnection(sourceId, "live");
    ws.send("snapshot");
  });

  ws.addEventListener("message", (event) => {
    receivedMessages += 1;
    if (typeof event.data === "string") {
      receivedBytes += event.data.length;
    }
    const frame = JSON.parse(event.data) as WorkerFrame;
    if (frame.type === "projection") {
      latestProjections.set(sourceId, frame.projection);
      scheduleRender();
    }
    if (frame.type === "error") renderError(frame.message);
  });

  ws.addEventListener("close", () => {
    setConnection(sourceId, "reconnecting");
    window.setTimeout(() => connect(sourceId), 900);
  });

  ws.addEventListener("error", () => {
    setConnection(sourceId, "error");
    ws.close();
  });
}

function connectObservability() {
  const workerUrl = import.meta.env.VITE_WORKER_WS_URL ?? `ws://${location.hostname}:8787/ws`;
  const url = new URL(workerUrl);
  url.pathname = "/observability/ws";
  const ws = new WebSocket(url.toString());

  ws.addEventListener("open", () => setConnection("observability", "live"));
  ws.addEventListener("message", (event) => {
    receivedMessages += 1;
    if (typeof event.data === "string") receivedBytes += event.data.length;
    const frame = JSON.parse(event.data) as WorkerFrame;
    if (frame.type === "observability") {
      latestObservability = [...latestObservability, frame.event].slice(-80);
      scheduleRender();
    }
  });
  ws.addEventListener("close", () => {
    setConnection("observability", "reconnecting");
    window.setTimeout(connectObservability, 900);
  });
  ws.addEventListener("error", () => {
    setConnection("observability", "error");
    ws.close();
  });
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(() => {
    renderQueued = false;
    if (!renderedArticle) return;
    const started = performance.now();
    renderedArticle.update(latestProjections);
    renderedArticle.updateObservability(latestObservability);
    totalRenderMs += performance.now() - started;
    renderCalls += 1;
  });
}

function articleEventSources(article: Article) {
  const sources = new Set<string>();
  if (article.default_event_source) sources.add(article.default_event_source);
  for (const block of article.blocks) {
    if (block.kind === "viz") sources.add(block.event_source);
  }
  return sources;
}

function setLoading() {
  appRoot.innerHTML = `<main class="article-shell"><p class="eyebrow">Spool v0 interactive article</p><p>Loading article.</p></main>`;
}

function setConnection(sourceId: string, status: "connecting" | "live" | "reconnecting" | "error") {
  connectionStates.set(sourceId, status);
  const statuses = [...connectionStates.values()];
  const aggregate = statuses.includes("error")
    ? "error"
    : statuses.includes("reconnecting")
      ? "reconnecting"
      : statuses.length > 0 && statuses.every((candidate) => candidate === "live")
        ? "live"
        : "connecting";
  const statusDot = document.querySelector<HTMLElement>("#status-dot");
  const statusText = document.querySelector<HTMLElement>("#status-text");
  if (!statusDot || !statusText) return;
  statusDot.className = aggregate;
  statusText.textContent = statuses.length > 1 ? `${aggregate} (${statuses.length} streams)` : aggregate;
}

function renderError(message: string) {
  const status = document.querySelector<HTMLElement>("#status-text");
  if (status) status.textContent = message;
}

function logPerf() {
  const now = performance.now();
  const elapsedSeconds = Math.max((now - lastPerfLogAt) / 1_000, 0.001);
  const averageRenderMs = renderCalls > 0 ? totalRenderMs / renderCalls : 0;
  console.info(
    `[frontend:perf] received=${(receivedMessages / elapsedSeconds).toFixed(1)}/s render=${(
      renderCalls / elapsedSeconds
    ).toFixed(1)}/s avgRender=${averageRenderMs.toFixed(2)}ms payload=${Math.round(receivedBytes / elapsedSeconds)}B/s`
  );
  receivedMessages = 0;
  receivedBytes = 0;
  renderCalls = 0;
  totalRenderMs = 0;
  lastPerfLogAt = now;
}
