import type { Projection } from "@spool/core";
import "./styles.css";
import { renderTopology } from "./topology-view";

type WorkerFrame =
  | { type: "projection"; projection: Projection }
  | { type: "error"; message: string }
  | { type: "hello"; clients: number };

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("app root missing");

app.innerHTML = `
  <main class="shell">
    <header class="masthead">
      <div>
        <p class="eyebrow">Spool v0</p>
        <h1>Agent topology</h1>
      </div>
      <div class="connection"><span id="status-dot"></span><span id="status-text">connecting</span></div>
    </header>

    <section class="metric-strip" aria-label="Run metrics">
      <article><span>Now</span><strong id="phase">idle</strong></article>
      <article><span>Active</span><strong id="active-count">0</strong></article>
      <article><span>Stale</span><strong id="stale-count">0</strong></article>
      <article><span>Failed</span><strong id="failed-count">0</strong></article>
      <article><span>Latency</span><strong id="latency">0ms</strong></article>
      <article><span>Retries</span><strong id="retries">0</strong></article>
    </section>

    <section class="workspace">
      <section class="map-panel" aria-label="Live topology">
        <div class="panel-head">
          <div>
            <h2>Topology</h2>
            <p id="run-summary">Waiting for event stream.</p>
          </div>
          <div id="legend" class="legend"></div>
        </div>
        <svg id="topology" viewBox="0 0 100 80" role="img" aria-label="Live topology state map"></svg>
      </section>

      <aside class="side-rail">
        <section class="panel">
          <h2>Recent changes</h2>
          <div id="changes" class="event-list"></div>
        </section>
        <section class="panel">
          <h2>Token excerpt</h2>
          <p id="tokens" class="tokens">No tokens yet.</p>
        </section>
      </aside>
    </section>

    <section class="detail-grid">
      <section class="panel">
        <h2>Retrieval traces</h2>
        <div id="retrievals" class="table-list"></div>
      </section>
      <section class="panel">
        <h2>Tools</h2>
        <div id="tool-list" class="table-list"></div>
      </section>
      <section class="panel">
        <h2>Errors and retries</h2>
        <div id="errors" class="event-list"></div>
      </section>
      <section class="panel">
        <h2>Event log</h2>
        <div id="log" class="event-list"></div>
      </section>
    </section>
  </main>
`;

const els = {
  statusDot: must("#status-dot"),
  statusText: must("#status-text"),
  phase: must("#phase"),
  activeCount: must("#active-count"),
  staleCount: must("#stale-count"),
  failedCount: must("#failed-count"),
  latency: must("#latency"),
  retries: must("#retries"),
  runSummary: must("#run-summary"),
  legend: must("#legend"),
  topology: mustSvg("#topology"),
  changes: must("#changes"),
  tokens: must("#tokens"),
  retrievals: must("#retrievals"),
  toolList: must("#tool-list"),
  errors: must("#errors"),
  log: must("#log")
};

const renderedCollectionLimit = 8;
let latestProjection: Projection | null = null;
let renderQueued = false;
let receivedMessages = 0;
let receivedBytes = 0;
let renderCalls = 0;
let totalRenderMs = 0;
let lastPerfLogAt = performance.now();

renderLegend();
connect();
if (import.meta.env.DEV) {
  window.setInterval(logPerf, 5_000);
}

function connect() {
  setConnection("connecting");
  const workerUrl = import.meta.env.VITE_WORKER_WS_URL ?? `ws://${location.hostname}:8787/ws`;
  const ws = new WebSocket(workerUrl);

  ws.addEventListener("open", () => {
    setConnection("live");
    ws.send("snapshot");
  });

  ws.addEventListener("message", (event) => {
    receivedMessages += 1;
    if (typeof event.data === "string") {
      receivedBytes += event.data.length;
    }
    const frame = JSON.parse(event.data) as WorkerFrame;
    if (frame.type === "projection") {
      latestProjection = frame.projection;
      scheduleRender();
    }
    if (frame.type === "error") renderError(frame.message);
  });

  ws.addEventListener("close", () => {
    setConnection("reconnecting");
    window.setTimeout(connect, 900);
  });

  ws.addEventListener("error", () => {
    setConnection("error");
    ws.close();
  });
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(() => {
    renderQueued = false;
    if (!latestProjection) return;
    const started = performance.now();
    renderProjection(latestProjection);
    totalRenderMs += performance.now() - started;
    renderCalls += 1;
  });
}

function renderProjection(projection: Projection) {
  const counts = {
    active: projection.topology.nodes.filter((node) => node.status === "active").length,
    stale: projection.topology.nodes.filter((node) => node.status === "stale").length,
    failed: projection.topology.nodes.filter((node) => node.status === "failed").length
  };
  els.phase.textContent = projection.phase;
  els.activeCount.textContent = String(counts.active);
  els.staleCount.textContent = String(counts.stale);
  els.failedCount.textContent = String(counts.failed);
  els.latency.textContent = `${projection.latency.current_ms}ms`;
  els.retries.textContent = formatNumber(projection.totals.retries);
  els.runSummary.textContent = `${projection.run_id ?? "local run"} · seq ${projection.last_seq} · ${formatNumber(
    projection.totals.streamed_tokens
  )} streamed tokens`;
  els.tokens.textContent = projection.token_excerpt || "No tokens yet.";

  renderTopology(els.topology, projection);
  renderChanges(projection);
  renderRetrievals(projection);
  renderTools(projection);
  renderErrors(projection);
  renderLog(projection);
}

function renderChanges(projection: Projection) {
  els.changes.innerHTML = projection.recent_changes
    .slice(-renderedCollectionLimit)
    .reverse()
    .map((change) => `<p class="${change.level}"><span>#${change.seq}</span><strong>${change.kind}</strong>${escapeHtml(change.label)}</p>`)
    .join("");
}

function renderRetrievals(projection: Projection) {
  els.retrievals.innerHTML = projection.retrievals
    .slice(-renderedCollectionLimit)
    .reverse()
    .map(
      (trace) => `
        <div class="row">
          <strong>${escapeHtml(trace.source)}</strong>
          <span>${escapeHtml(shorten(trace.query, 42))}</span>
          <em>${Math.round(trace.score * 100)}% ${trace.status}</em>
        </div>
      `
    )
    .join("");
}

function renderTools(projection: Projection) {
  els.toolList.innerHTML = projection.active_tools
    .slice(0, renderedCollectionLimit)
    .map(
      (tool) => `
        <div class="row">
          <strong>${escapeHtml(tool.name)}</strong>
          <span>${escapeHtml(tool.status)}</span>
          <em>${tool.duration_ms}ms</em>
        </div>
      `
    )
    .join("");
}

function renderErrors(projection: Projection) {
  const retryLines = projection.timeline.filter((item) => item.kind === "retry").slice(-4);
  const errorLines = projection.errors
    .slice(-4)
    .map((error, index) => ({ seq: projection.last_seq - index, label: error }));
  els.errors.innerHTML = [
    ...errorLines.map((error) => `<p class="error"><span>#${error.seq}</span>${escapeHtml(error.label)}</p>`),
    ...retryLines.reverse().map((retry) => `<p class="warn"><span>#${retry.seq}</span>${escapeHtml(retry.label)}</p>`)
  ].join("");
}

function renderLog(projection: Projection) {
  els.log.innerHTML = projection.log
    .slice(-renderedCollectionLimit)
    .reverse()
    .map((item) => `<p class="${item.level}"><span>#${item.seq}</span><strong>${item.kind}</strong>${escapeHtml(item.label)}</p>`)
    .join("");
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

function renderError(message: string) {
  els.errors.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
}

function renderLegend() {
  els.legend.innerHTML = ["active", "idle", "stale", "failed"]
    .map((status) => `<span class="${status}"><i></i>${status}</span>`)
    .join("");
}

function setConnection(status: "connecting" | "live" | "reconnecting" | "error") {
  els.statusDot.className = status;
  els.statusText.textContent = status;
}

function must(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`${selector} missing`);
  return element;
}

function mustSvg(selector: string) {
  const element = document.querySelector<SVGSVGElement>(selector);
  if (!element) throw new Error(`${selector} missing`);
  return element;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function shorten(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
