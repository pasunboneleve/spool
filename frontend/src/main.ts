import * as d3 from "d3";
import "./styles.css";

type Projection = {
  run_id: string | null;
  phase: string;
  last_seq: number;
  totals: {
    input_tokens: number;
    output_tokens: number;
    streamed_tokens: number;
    tool_calls: number;
    retries: number;
    retrievals: number;
    failures: number;
  };
  latency: {
    current_ms: number;
    max_ms: number;
    samples: Array<{ seq: number; ts_ms: number; ms: number }>;
  };
  active_tools: Array<{ id: string; name: string; status: string; duration_ms: number }>;
  retrievals: Array<{ source: string; query: string; score: number; status: string }>;
  log: Array<{ seq: number; ts_ms: number; level: string; message: string }>;
  tokens: Array<{ seq: number; text: string }>;
  errors: string[];
  topology: {
    nodes: TopologyNode[];
    edges: TopologyEdge[];
    changes: Array<{ seq: number; component: string; level: string; message: string }>;
  };
};

type TopologyNode = {
  id: string;
  label: string;
  kind: string;
  status: Status;
  x: number;
  y: number;
  last_seq: number;
  summary: string;
};

type TopologyEdge = {
  source: string;
  target: string;
  status: Status;
  count: number;
  last_seq: number;
  label: string;
};

type Status = "active" | "idle" | "stale" | "failed" | "warning";
type Frame = { type: "projection"; projection: Projection };

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("app root missing");

app.innerHTML = `
  <main class="shell">
    <header class="masthead">
      <div>
        <p class="eyebrow">Local-first realtime blog</p>
        <h1>Agent observability map</h1>
      </div>
      <div class="connection"><span id="status-dot"></span><span id="status-text">connecting</span></div>
    </header>

    <section class="metric-strip" aria-label="Run metrics">
      <article><span>State</span><strong id="phase">starting</strong></article>
      <article><span>Input</span><strong id="input-tokens">0</strong></article>
      <article><span>Output</span><strong id="output-tokens">0</strong></article>
      <article><span>Latency</span><strong id="latency">0ms</strong></article>
      <article><span>Tools</span><strong id="tools">0</strong></article>
      <article><span>Retries</span><strong id="retries">0</strong></article>
    </section>

    <section class="workspace">
      <section class="map-panel" aria-label="Live topology">
        <div class="panel-head">
          <div>
            <h2>Topology</h2>
            <p id="run-summary">Waiting for Rust projection.</p>
          </div>
          <div id="legend" class="legend"></div>
        </div>
        <svg id="topology" viewBox="0 0 100 74" role="img" aria-label="Live topology state map"></svg>
      </section>

      <aside class="side-rail">
        <section class="panel">
          <h2>Recent changes</h2>
          <div id="changes" class="event-list"></div>
        </section>
        <section class="panel">
          <h2>Token excerpt</h2>
          <p id="tokens" class="tokens"></p>
        </section>
      </aside>
    </section>

    <section class="detail-grid">
      <section class="panel">
        <h2>Retrieval traces</h2>
        <div id="retrievals" class="table-list"></div>
      </section>
      <section class="panel">
        <h2>Tool calls</h2>
        <div id="tool-list" class="table-list"></div>
      </section>
      <section class="panel">
        <h2>Latency</h2>
        <svg id="latency-chart" viewBox="0 0 120 32" class="sparkline" aria-label="Latency sparkline"></svg>
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
  inputTokens: must("#input-tokens"),
  outputTokens: must("#output-tokens"),
  latency: must("#latency"),
  tools: must("#tools"),
  retries: must("#retries"),
  phase: must("#phase"),
  runSummary: must("#run-summary"),
  legend: must("#legend"),
  topology: mustSvg("#topology"),
  changes: must("#changes"),
  tokens: must("#tokens"),
  retrievals: must("#retrievals"),
  toolList: must("#tool-list"),
  latencyChart: mustSvg("#latency-chart"),
  log: must("#log")
};

let projection: Projection | null = null;
let connection = "connecting";

renderLegend();
connect();

function connect() {
  setConnection("connecting");
  const workerUrl = import.meta.env.VITE_WORKER_WS_URL ?? `ws://${location.hostname}:8787/ws`;
  const ws = new WebSocket(workerUrl);

  ws.addEventListener("open", () => {
    setConnection("live");
    ws.send("snapshot");
  });

  ws.addEventListener("message", (event) => {
    const frame = JSON.parse(event.data) as Frame;
    if (frame.type !== "projection") return;
    projection = frame.projection;
    renderProjection(frame.projection);
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

function renderProjection(next: Projection) {
  els.phase.textContent = next.phase || "starting";
  els.inputTokens.textContent = formatNumber(next.totals.input_tokens);
  els.outputTokens.textContent = formatNumber(next.totals.output_tokens);
  els.latency.textContent = `${next.latency.current_ms}ms`;
  els.tools.textContent = formatNumber(next.totals.tool_calls);
  els.retries.textContent = formatNumber(next.totals.retries);
  els.runSummary.textContent = `${next.run_id ?? "local run"} · seq ${next.last_seq} · ${formatNumber(
    next.totals.streamed_tokens
  )} streamed tokens`;

  renderTopology(next);
  renderTokenExcerpt(next);
  renderChanges(next);
  renderRetrievals(next);
  renderTools(next);
  renderLatency(next);
  renderLog(next);
}

function renderTopology(next: Projection) {
  const nodes = new Map(next.topology.nodes.map((node) => [node.id, node]));
  const edges = next.topology.edges.filter((edge) => nodes.has(edge.source) && nodes.has(edge.target));

  const edgeMarkup = edges
    .map((edge) => {
      const source = nodes.get(edge.source);
      const target = nodes.get(edge.target);
      if (!source || !target) return "";
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      return `
        <g class="map-edge ${edge.status}">
          <line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" />
          <text x="${midX}" y="${midY - 2}">${escapeHtml(edge.label)}</text>
        </g>
      `;
    })
    .join("");

  const nodeMarkup = next.topology.nodes
    .map(
      (node) => `
        <g class="map-node ${node.status}" transform="translate(${node.x} ${node.y})">
          <circle r="${node.kind === "core" ? 6.2 : 5}" />
          <text class="label" x="0" y="-8">${escapeHtml(node.label)}</text>
          <text class="summary" x="0" y="10">${escapeHtml(shorten(node.summary, 28))}</text>
        </g>
      `
    )
    .join("");

  els.topology.innerHTML = `
    <g class="map-grid">
      <line x1="8" y1="18" x2="94" y2="18" />
      <line x1="8" y1="37" x2="94" y2="37" />
      <line x1="8" y1="56" x2="94" y2="56" />
    </g>
    ${edgeMarkup}
    ${nodeMarkup}
  `;
}

function renderTokenExcerpt(next: Projection) {
  const text = next.tokens.map((token) => token.text).join("");
  els.tokens.textContent = text.slice(-360);
}

function renderChanges(next: Projection) {
  els.changes.innerHTML = next.topology.changes
    .slice(-8)
    .reverse()
    .map(
      (change) => `
        <p class="${change.level}">
          <span>#${change.seq}</span>
          <strong>${escapeHtml(change.component)}</strong>
          ${escapeHtml(change.message)}
        </p>
      `
    )
    .join("");
}

function renderRetrievals(next: Projection) {
  els.retrievals.innerHTML = next.retrievals
    .slice(-6)
    .reverse()
    .map(
      (trace) => `
        <div class="row">
          <strong>${escapeHtml(trace.source)}</strong>
          <span>${escapeHtml(shorten(trace.query, 44))}</span>
          <em>${Math.round(trace.score * 100)}% ${escapeHtml(trace.status)}</em>
        </div>
      `
    )
    .join("");
}

function renderTools(next: Projection) {
  els.toolList.innerHTML = next.active_tools
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

function renderLatency(next: Projection) {
  const samples = next.latency.samples.slice(-48);
  if (samples.length < 2) {
    els.latencyChart.innerHTML = "";
    return;
  }
  const x = d3.scaleLinear([0, samples.length - 1], [4, 116]);
  const y = d3.scaleLinear([0, Math.max(next.latency.max_ms, 1)], [28, 4]);
  const line = d3
    .line<(typeof samples)[number]>()
    .x((_, index) => x(index))
    .y((sample) => y(sample.ms));
  els.latencyChart.innerHTML = `
    <path class="sparkline-rule" d="M4 28 H116" />
    <path class="sparkline-path" d="${line(samples) ?? ""}" />
  `;
}

function renderLog(next: Projection) {
  els.log.innerHTML = next.log
    .slice(-10)
    .reverse()
    .map(
      (item) => `
        <p class="${item.level}">
          <span>#${item.seq}</span>
          ${escapeHtml(item.message)}
        </p>
      `
    )
    .join("");
}

function renderLegend() {
  els.legend.innerHTML = ["active", "warning", "failed", "stale", "idle"]
    .map((status) => `<span class="${status}"><i></i>${status}</span>`)
    .join("");
}

function setConnection(next: string) {
  connection = next;
  els.statusText.textContent = connection;
  els.statusDot.className = connection;
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

function shorten(value: string, length: number) {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1)}…`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return entities[char] ?? char;
  });
}
