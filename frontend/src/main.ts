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
  timeline: Array<{ seq: number; ts_ms: number; lane: string; label: string; intensity: number }>;
  graph: {
    nodes: Array<{ id: string; label: string; group: string; weight: number }>;
    edges: Array<{ source: string; target: string; weight: number }>;
  };
  log: Array<{ seq: number; ts_ms: number; level: string; message: string }>;
  tokens: Array<{ seq: number; text: string }>;
  errors: string[];
};

type Frame = {
  type: "projection";
  projection: Projection;
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("app root missing");

app.innerHTML = `
  <main class="shell">
    <section class="topbar">
      <div>
        <p class="eyebrow">Local-first realtime blog</p>
        <h1>Compiler-corrected agent stream</h1>
      </div>
      <div class="status"><span id="status-dot"></span><span id="status-text">connecting</span></div>
    </section>
    <section class="metrics">
      <article><span>Input</span><strong id="input-tokens">0</strong></article>
      <article><span>Output</span><strong id="output-tokens">0</strong></article>
      <article><span>Streamed</span><strong id="streamed-tokens">0</strong></article>
      <article><span>Latency</span><strong id="latency">0ms</strong></article>
      <article><span>Tools</span><strong id="tools">0</strong></article>
      <article><span>Retries</span><strong id="retries">0</strong></article>
    </section>
    <section class="stage">
      <div class="canvas-wrap">
        <canvas id="activity"></canvas>
      </div>
      <aside class="side">
        <div class="phase"><span>State</span><strong id="phase">starting</strong></div>
        <div>
          <h2>Token stream</h2>
          <p id="tokens" class="tokens"></p>
        </div>
        <div>
          <h2>Retrieval traces</h2>
          <div id="retrievals" class="stack"></div>
        </div>
      </aside>
    </section>
    <section class="bottom">
      <div>
        <h2>Tool calls</h2>
        <div id="tool-list" class="stack"></div>
      </div>
      <div>
        <h2>Event log</h2>
        <div id="log" class="log"></div>
      </div>
    </section>
  </main>
`;

const canvas = mustCanvas("#activity");
const ctx = mustContext(canvas);

const els = {
  statusDot: must("#status-dot"),
  statusText: must("#status-text"),
  inputTokens: must("#input-tokens"),
  outputTokens: must("#output-tokens"),
  streamedTokens: must("#streamed-tokens"),
  latency: must("#latency"),
  tools: must("#tools"),
  retries: must("#retries"),
  phase: must("#phase"),
  tokens: must("#tokens"),
  retrievals: must("#retrievals"),
  toolList: must("#tool-list"),
  log: must("#log")
};

let projection: Projection | null = null;
let connection = "connecting";
let pulse = 0;

connect();
requestAnimationFrame(draw);

function connect() {
  setConnection("connecting");
  const ws = new WebSocket(`ws://${location.hostname}:8787/ws`);

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
  els.inputTokens.textContent = formatNumber(next.totals.input_tokens);
  els.outputTokens.textContent = formatNumber(next.totals.output_tokens);
  els.streamedTokens.textContent = formatNumber(next.totals.streamed_tokens);
  els.latency.textContent = `${next.latency.current_ms}ms`;
  els.tools.textContent = formatNumber(next.totals.tool_calls);
  els.retries.textContent = formatNumber(next.totals.retries);
  els.phase.textContent = next.phase;
  els.tokens.textContent = next.tokens.map((token) => token.text).join("");
  els.tokens.scrollTop = els.tokens.scrollHeight;
  els.retrievals.innerHTML = next.retrievals
    .slice(-5)
    .reverse()
    .map(
      (trace) =>
        `<div class="row"><strong>${escapeHtml(trace.source)}</strong><span>${escapeHtml(trace.query)}</span><em>${Math.round(
          trace.score * 100
        )}% ${escapeHtml(trace.status)}</em></div>`
    )
    .join("");
  els.toolList.innerHTML = next.active_tools
    .map(
      (tool) =>
        `<div class="row"><strong>${escapeHtml(tool.name)}</strong><span>${escapeHtml(tool.status)}</span><em>${tool.duration_ms}ms</em></div>`
    )
    .join("");
  els.log.innerHTML = next.log
    .slice(-12)
    .reverse()
    .map((item) => `<p class="${item.level}"><span>#${item.seq}</span>${escapeHtml(item.message)}</p>`)
    .join("");
}

function draw() {
  pulse += 0.016;
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintBackdrop();
  if (projection) {
    paintTimeline(projection);
    paintGraph(projection);
    paintLatency(projection);
  } else {
    paintWaiting();
  }
  requestAnimationFrame(draw);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(rect.width * dpr));
  const height = Math.max(320, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function paintBackdrop() {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#071015");
  gradient.addColorStop(0.55, "#13251f");
  gradient.addColorStop(1, "#1f1d12");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
}

function paintTimeline(next: Projection) {
  const lanes = Array.from(new Set(next.timeline.map((item) => item.lane)));
  const y = d3.scalePoint(lanes, [canvas.height * 0.16, canvas.height * 0.82]).padding(0.4);
  const recent = next.timeline.slice(-80);
  const seqs = recent.map((item) => item.seq);
  const x = d3.scaleLinear([Math.min(...seqs, 0), Math.max(...seqs, 1)], [canvas.width * 0.07, canvas.width * 0.93]);
  const color = d3.scaleOrdinal<string, string>()
    .domain(lanes)
    .range(["#7dd3fc", "#facc15", "#fb7185", "#c084fc", "#34d399", "#f97316", "#f8fafc"]);

  ctx.font = `${12 * devicePixelRatio}px Inter, system-ui`;
  ctx.textBaseline = "middle";
  for (const lane of lanes) {
    const laneY = y(lane) ?? 0;
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillText(lane, canvas.width * 0.03, laneY);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.16, laneY);
    ctx.lineTo(canvas.width * 0.94, laneY);
    ctx.stroke();
  }

  for (const item of recent) {
    const itemX = x(item.seq);
    const itemY = y(item.lane) ?? canvas.height / 2;
    const radius = (5 + item.intensity * 12 + Math.sin(pulse * 5 + item.seq) * 2) * devicePixelRatio;
    ctx.fillStyle = color(item.lane);
    ctx.globalAlpha = 0.3 + item.intensity * 0.55;
    ctx.beginPath();
    ctx.arc(itemX, itemY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function paintGraph(next: Projection) {
  const nodes = next.graph.nodes.slice(-18);
  if (nodes.length === 0) return;
  const centerX = canvas.width * 0.72;
  const centerY = canvas.height * 0.44;
  const radius = Math.min(canvas.width, canvas.height) * 0.22;
  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2 + pulse * 0.18;
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    });
  });

  ctx.lineWidth = 1.5 * devicePixelRatio;
  for (const edge of next.graph.edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) continue;
    ctx.strokeStyle = `rgba(125,211,252,${Math.min(0.5, 0.12 + edge.weight * 0.16)})`;
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
  }

  for (const node of nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const weight = Math.min(18, 7 + node.weight * 2);
    ctx.fillStyle = groupColor(node.group);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, weight * devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.font = `${11 * devicePixelRatio}px Inter, system-ui`;
    ctx.fillText(node.label, pos.x + 12 * devicePixelRatio, pos.y);
  }
}

function paintLatency(next: Projection) {
  const samples = next.latency.samples.slice(-40);
  if (samples.length < 2) return;
  const x = d3.scaleLinear([0, samples.length - 1], [canvas.width * 0.08, canvas.width * 0.42]);
  const y = d3.scaleLinear([0, Math.max(next.latency.max_ms, 1)], [canvas.height * 0.9, canvas.height * 0.68]);
  ctx.strokeStyle = "#34d399";
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.beginPath();
  samples.forEach((sample, index) => {
    const px = x(index);
    const py = y(sample.ms);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `${12 * devicePixelRatio}px Inter, system-ui`;
  ctx.fillText("latency", canvas.width * 0.08, canvas.height * 0.64);
}

function paintWaiting() {
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = `${18 * devicePixelRatio}px Inter, system-ui`;
  ctx.fillText("Waiting for Rust projection...", canvas.width * 0.08, canvas.height * 0.5);
}

function setConnection(next: string) {
  connection = next;
  els.statusText.textContent = connection;
  els.statusDot.className = connection;
}

function groupColor(group: string) {
  if (group === "tool") return "#facc15";
  if (group === "retrieval") return "#7dd3fc";
  if (group === "error") return "#fb7185";
  if (group === "control") return "#c084fc";
  if (group === "output") return "#34d399";
  return "#f8fafc";
}

function must(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`${selector} missing`);
  return element;
}

function mustCanvas(selector: string) {
  const element = document.querySelector<HTMLCanvasElement>(selector);
  if (!element) throw new Error(`${selector} missing`);
  return element;
}

function mustContext(element: HTMLCanvasElement) {
  const context = element.getContext("2d");
  if (!context) throw new Error("2d context missing");
  return context;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
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
