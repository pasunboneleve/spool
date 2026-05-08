import type { AgentEvent, Status } from "./event-schema";

export type TopologyNode = {
  id: string;
  label: string;
  kind: string;
  status: Status;
  last_seen_seq: number;
  last_seen_ms: number;
  annotation: string;
};

export type TopologyEdge = {
  from: string;
  to: string;
  status: Status;
  flow_count: number;
  last_activity_seq: number;
  retry_count: number;
  failure_count: number;
  annotation: string;
};

export type Topology = {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
};

type MutableTopology = {
  nodes: Map<string, TopologyNode>;
  edges: Map<string, TopologyEdge>;
};

export const initialNodeSpecs = [
  ["browser", "Browser", "surface"],
  ["worker-shell", "Worker shell", "transport"],
  ["core", "Core", "state"],
  ["mock-agent", "Mock agent", "source"],
  ["retriever", "Retriever", "retrieval"],
  ["model", "Model", "model"],
  ["tool-runner", "Tool runner", "tool"]
] as const;

export const initialEdgeSpecs = [
  ["mock-agent", "worker-shell", "events"],
  ["worker-shell", "core", "reduce"],
  ["core", "worker-shell", "projection"],
  ["worker-shell", "browser", "broadcast"],
  ["model", "mock-agent", "tokens"],
  ["retriever", "mock-agent", "retrieval"],
  ["tool-runner", "mock-agent", "tools"]
] as const;

export function createTopology(): MutableTopology {
  const nodes = new Map<string, TopologyNode>();
  for (const [id, label, kind] of initialNodeSpecs) {
    nodes.set(id, {
      id,
      label,
      kind,
      status: "idle",
      last_seen_seq: 0,
      last_seen_ms: 0,
      annotation: "waiting"
    });
  }

  const edges = new Map<string, TopologyEdge>();
  for (const [from, to, annotation] of initialEdgeSpecs) {
    edges.set(edgeKey(from, to), {
      from,
      to,
      status: "idle",
      flow_count: 0,
      last_activity_seq: 0,
      retry_count: 0,
      failure_count: 0,
      annotation
    });
  }
  return { nodes, edges };
}

export function cloneTopology(topology: MutableTopology): MutableTopology {
  return {
    nodes: new Map([...topology.nodes].map(([id, node]) => [id, { ...node }])),
    edges: new Map([...topology.edges].map(([id, edge]) => [id, { ...edge }]))
  };
}

export function applyTopologyEvent(topology: MutableTopology, event: AgentEvent): void {
  touch(topology, "mock-agent", event, event.kind);
  touchEdge(topology, "mock-agent", "worker-shell", event, "event");
  touch(topology, "worker-shell", event, "fanout");
  touchEdge(topology, "worker-shell", "core", event, "reduce");
  touch(topology, "core", event, "projection");
  touchEdge(topology, "core", "worker-shell", event, "project");
  touchEdge(topology, "worker-shell", "browser", event, "broadcast");
  touch(topology, "browser", event, "rendering");

  if (event.kind === "thinking" || event.kind === "token" || event.kind === "usage" || event.kind === "latency") {
    touch(topology, "model", event, event.kind === "token" ? "streaming" : "active");
    touchEdge(topology, "model", "mock-agent", event, event.kind);
  }

  if (event.kind === "retrieval") {
    touch(topology, "retriever", event, event.payload.source);
    touchEdge(topology, "retriever", "mock-agent", event, event.payload.status);
  }

  if (event.kind === "tool_call") {
    const status = event.payload.status === "failed" ? "failed" : "active";
    touch(topology, "tool-runner", event, event.payload.name, status);
    touchEdge(topology, "tool-runner", "mock-agent", event, event.payload.name, status);
  }

  if (event.kind === "retry") {
    touch(topology, "core", event, `retry: ${event.payload.target}`, "active");
    incrementRetry(topology, "worker-shell", "core");
  }

  if (event.kind === "failure") {
    const component = normaliseComponent(event.payload.component);
    touch(topology, component, event, event.payload.message, "failed");
    incrementFailure(topology, "worker-shell", "core");
  }

  markStale(topology, event.seq, event.ts_ms);
}

export function projectTopology(topology: MutableTopology): Topology {
  return {
    nodes: [...topology.nodes.values()],
    edges: [...topology.edges.values()]
  };
}

function touch(
  topology: MutableTopology,
  id: string,
  event: AgentEvent,
  annotation: string,
  status: Status = "active"
) {
  const node = topology.nodes.get(id);
  if (!node) return;
  node.status = status;
  node.last_seen_seq = event.seq;
  node.last_seen_ms = event.ts_ms;
  node.annotation = annotation;
}

function touchEdge(
  topology: MutableTopology,
  from: string,
  to: string,
  event: AgentEvent,
  annotation: string,
  status: Status = "active"
) {
  const edge = topology.edges.get(edgeKey(from, to));
  if (!edge) return;
  edge.status = status;
  edge.flow_count += 1;
  edge.last_activity_seq = event.seq;
  edge.annotation = annotation;
}

function incrementRetry(topology: MutableTopology, from: string, to: string) {
  const edge = topology.edges.get(edgeKey(from, to));
  if (edge) edge.retry_count += 1;
}

function incrementFailure(topology: MutableTopology, from: string, to: string) {
  const edge = topology.edges.get(edgeKey(from, to));
  if (edge) {
    edge.failure_count += 1;
    edge.status = "failed";
  }
}

function markStale(topology: MutableTopology, seq: number, tsMs: number) {
  for (const node of topology.nodes.values()) {
    if (node.status === "active" && seq - node.last_seen_seq > 10) node.status = "stale";
    if (node.status === "idle" && node.last_seen_ms > 0 && tsMs - node.last_seen_ms > 5_000) node.status = "stale";
  }
  for (const edge of topology.edges.values()) {
    if (edge.status === "active" && seq - edge.last_activity_seq > 10) edge.status = "stale";
  }
}

function normaliseComponent(component: string) {
  if (component === "tool" || component === "tool-runner") return "tool-runner";
  if (component === "retrieval" || component === "retriever") return "retriever";
  if (component === "model") return "model";
  if (component === "worker" || component === "worker-shell") return "worker-shell";
  if (component === "browser") return "browser";
  return "core";
}

function edgeKey(from: string, to: string) {
  return `${from}->${to}`;
}
