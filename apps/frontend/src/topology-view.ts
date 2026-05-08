import type { Projection, Status, TopologyEdge, TopologyNode } from "@spool/core";
import * as d3 from "d3";

type PositionedNode = TopologyNode & { x: number; y: number };

const layout: Record<string, { x: number; y: number }> = {
  "mock-agent": { x: 12, y: 42 },
  retriever: { x: 28, y: 22 },
  model: { x: 28, y: 62 },
  "tool-runner": { x: 28, y: 42 },
  "worker-shell": { x: 52, y: 42 },
  core: { x: 72, y: 42 },
  browser: { x: 90, y: 42 }
};

const statusRank: Record<Status, number> = {
  failed: 4,
  active: 3,
  stale: 2,
  idle: 1
};

export function renderTopology(svg: SVGSVGElement, projection: Projection) {
  const compact = window.matchMedia("(max-width: 42rem)").matches;
  const nodes = projection.topology.nodes.map<PositionedNode>((node) => ({
    ...node,
    ...(layout[node.id] ?? { x: 50, y: 50 })
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = projection.topology.edges.filter((edge) => nodeById.has(edge.from) && nodeById.has(edge.to));
  const edgePath = d3
    .line<[number, number]>()
    .curve(d3.curveBumpX)
    .x(([x]) => x)
    .y(([, y]) => y);

  svg.innerHTML = `
    <g class="map-rule">
      <line x1="6" y1="42" x2="94" y2="42"></line>
      <line x1="28" y1="18" x2="28" y2="66"></line>
    </g>
    <g class="map-edges">
      ${edges.map((edge) => renderEdge(edge, nodeById, edgePath)).join("")}
    </g>
    <g class="map-nodes">
      ${nodes
        .sort((a, b) => statusRank[a.status] - statusRank[b.status])
        .map((node) => renderNode(node, compact))
        .join("")}
    </g>
  `;
}

function renderEdge(
  edge: TopologyEdge,
  nodeById: Map<string, PositionedNode>,
  edgePath: d3.Line<[number, number]>
) {
  const from = nodeById.get(edge.from);
  const to = nodeById.get(edge.to);
  if (!from || !to) return "";
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const path = edgePath([
    [from.x, from.y],
    [midX, midY],
    [to.x, to.y]
  ]);
  return `
    <g class="map-edge ${edge.status}">
      <path d="${path ?? ""}"></path>
    </g>
  `;
}

function renderNode(node: PositionedNode, compact: boolean) {
  return `
    <g class="map-node ${node.status}" transform="translate(${node.x} ${node.y})">
      <circle r="${node.kind === "state" ? 5.8 : 4.8}"></circle>
      <text class="label" x="0" y="-8">${escapeHtml(compactLabel(node, compact))}</text>
      <text class="annotation" x="0" y="9">${escapeHtml(shorten(node.annotation, 24))}</text>
    </g>
  `;
}

function compactLabel(node: TopologyNode, compact: boolean) {
  if (!compact) return node.label;
  return (
    {
      "mock-agent": "Mock",
      "worker-shell": "Worker",
      "tool-runner": "Tools"
    }[node.id] ?? node.label
  );
}

function shorten(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
