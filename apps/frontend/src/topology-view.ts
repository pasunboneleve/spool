import type { Projection, Status, TopologyEdge, TopologyNode } from "@spool/core";
import * as d3 from "d3";

type PositionedNode = TopologyNode & { x: number; y: number };
type PositionedEdge = TopologyEdge & { source: PositionedNode; target: PositionedNode };

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
  const edges = projection.topology.edges.flatMap<PositionedEdge>((edge) => {
    const source = nodeById.get(edge.from);
    const target = nodeById.get(edge.to);
    return source && target ? [{ ...edge, source, target }] : [];
  });
  const edgePath = d3
    .line<[number, number]>()
    .curve(d3.curveBumpX)
    .x(([x]) => x)
    .y(([, y]) => y);

  const root = d3.select(svg);
  const rules = root.selectAll<SVGGElement, unknown>("g.map-rule").data([null]);
  const rulesEnter = rules.enter().append("g").attr("class", "map-rule");
  rulesEnter.append("line").attr("data-rule", "horizontal");
  rulesEnter.append("line").attr("data-rule", "vertical");
  root
    .select<SVGGElement>("g.map-rule")
    .selectAll<SVGLineElement, { id: string; x1: number; y1: number; x2: number; y2: number }>("line")
    .data([
      { id: "horizontal", x1: 6, y1: 42, x2: 94, y2: 42 },
      { id: "vertical", x1: 28, y1: 18, x2: 28, y2: 66 }
    ])
    .join("line")
    .attr("x1", (rule) => rule.x1)
    .attr("y1", (rule) => rule.y1)
    .attr("x2", (rule) => rule.x2)
    .attr("y2", (rule) => rule.y2);

  root.selectAll<SVGGElement, unknown>("g.map-edges").data([null]).join("g").attr("class", "map-edges");
  root.selectAll<SVGGElement, unknown>("g.map-nodes").data([null]).join("g").attr("class", "map-nodes");

  root
    .select<SVGGElement>("g.map-edges")
    .selectAll<SVGGElement, PositionedEdge>("g.map-edge")
    .data(edges, (edge) => `${edge.from}->${edge.to}`)
    .join((enter) => {
      const group = enter.append("g").attr("class", "map-edge");
      group.append("path");
      return group;
    })
    .attr("class", (edge) => `map-edge ${edge.status}`)
    .select("path")
    .attr("d", (edge) => renderEdgePath(edge, edgePath));

  root
    .select<SVGGElement>("g.map-nodes")
    .selectAll<SVGGElement, PositionedNode>("g.map-node")
    .data(
      [...nodes].sort((a, b) => statusRank[a.status] - statusRank[b.status]),
      (node) => node.id
    )
    .join((enter) => {
      const group = enter.append("g");
      group.append("circle");
      group.append("text").attr("class", "label").attr("x", 0).attr("y", -8);
      group.append("text").attr("class", "annotation").attr("x", 0).attr("y", 9);
      return group;
    })
    .attr("class", (node) => `map-node ${node.status}`)
    .attr("transform", (node) => `translate(${node.x} ${node.y})`)
    .call((selection) => {
      selection.select("circle").attr("r", (node) => (node.kind === "state" ? 5.8 : 4.8));
      selection.select<SVGTextElement>("text.label").text((node) => compactLabel(node, compact));
      selection.select<SVGTextElement>("text.annotation").text((node) => shorten(node.annotation, 24));
    });
}

function renderEdgePath(edge: PositionedEdge, edgePath: d3.Line<[number, number]>) {
  const midX = (edge.source.x + edge.target.x) / 2;
  const midY = (edge.source.y + edge.target.y) / 2;
  return (
    edgePath([
      [edge.source.x, edge.source.y],
      [midX, midY],
      [edge.target.x, edge.target.y]
    ]) ?? ""
  );
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
