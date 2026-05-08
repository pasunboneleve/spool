import type { ArticleBlock, Projection, VizType } from "@spool/core";
import { renderTopology } from "./topology-view";

type VizBlock = Extract<ArticleBlock, { kind: "viz" }>;
type VizRenderer = (root: HTMLElement, block: VizBlock, projection: Projection | null) => void;

const registry = new Map<VizType, VizRenderer>();

export function registerDefaultVisualisations() {
  registry.set("topology", renderTopologyViz);
  registry.set("metrics", renderMetricsViz);
  registry.set("tokens", renderTokensViz);
  registry.set("timeline", renderTimelineViz);
}

export function renderViz(root: HTMLElement, block: VizBlock, projection: Projection | null) {
  const renderer = registry.get(block.type);
  if (!renderer) {
    root.textContent = `Unknown visualisation: ${block.type}`;
    return;
  }
  renderer(root, block, projection);
}

function renderTopologyViz(root: HTMLElement, _block: VizBlock, projection: Projection | null) {
  const svg = mustChild<SVGSVGElement>(root, "svg", () => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    element.setAttribute("viewBox", "0 0 100 80");
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", "Live topology state map");
    element.classList.add("topology-map");
    return element;
  });
  if (projection) renderTopology(svg, projection);
}

function renderMetricsViz(root: HTMLElement, _block: VizBlock, projection: Projection | null) {
  const items: Array<[string, string]> = projection
    ? [
        ["Phase", projection.phase],
        ["Streamed", formatNumber(projection.totals.streamed_tokens)],
        ["Latency", `${projection.latency.current_ms}ms`],
        ["Retries", formatNumber(projection.totals.retries)],
        ["Failures", formatNumber(projection.totals.failures)],
        ["Seq", formatNumber(projection.last_seq)]
      ]
    : [
        ["Phase", "idle"],
        ["Streamed", "0"],
        ["Latency", "0ms"],
        ["Retries", "0"],
        ["Failures", "0"],
        ["Seq", "0"]
      ];

  keyedHtml(root, "metric-grid", items, ([label, value]) => label, ([label, value]) => `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `);
}

function renderTokensViz(root: HTMLElement, _block: VizBlock, projection: Projection | null) {
  const tokenBox = mustChild<HTMLElement>(root, "p", () => {
    const element = document.createElement("p");
    element.className = "tokens";
    return element;
  });
  tokenBox.textContent = projection?.token_excerpt || "No tokens yet.";
}

function renderTimelineViz(root: HTMLElement, _block: VizBlock, projection: Projection | null) {
  const items = projection?.recent_changes.slice(-8).reverse() ?? [];
  keyedHtml(root, "event-list", items, (item) => String(item.seq), (item) => `
    <p class="${item.level}">
      <span>#${item.seq}</span><strong>${item.kind}</strong>${escapeHtml(item.label)}
    </p>
  `);
}

function keyedHtml<T>(root: HTMLElement, className: string, items: T[], key: (item: T) => string, render: (item: T) => string) {
  const container = mustChild<HTMLElement>(root, `.${className}`, () => {
    const element = document.createElement("div");
    element.className = className;
    return element;
  });
  const existing = new Map([...container.children].map((child) => [(child as HTMLElement).dataset.key, child as HTMLElement]));
  const seen = new Set<string>();

  for (const item of items) {
    const itemKey = key(item);
    seen.add(itemKey);
    let element = existing.get(itemKey);
    if (!element) {
      element = document.createElement("div");
      element.dataset.key = itemKey;
    }
    element.innerHTML = render(item);
    container.append(element);
  }

  for (const [itemKey, element] of existing) {
    if (itemKey && !seen.has(itemKey)) element.remove();
  }
}

function mustChild<T extends Element>(root: HTMLElement, selector: string, create: () => T): T {
  const existing = root.querySelector<T>(selector);
  if (existing) return existing;
  const created = create();
  root.append(created);
  return created;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
