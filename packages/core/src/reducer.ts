import type { AgentEvent } from "./event-schema";
import { applyTopologyEvent, cloneTopology, createTopology, type TopologyEdge, type TopologyNode } from "./topology";

export type TimelineItem = {
  seq: number;
  ts_ms: number;
  kind: AgentEvent["kind"];
  label: string;
  level: "info" | "warn" | "error";
};

export type RetrievalTrace = {
  source: string;
  query: string;
  score: number;
  status: "hit" | "partial" | "miss";
  seq: number;
};

export type ToolState = {
  id: string;
  name: string;
  status: "started" | "running" | "succeeded" | "failed";
  duration_ms: number;
  seq: number;
};

export type CoreState = {
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
  active_tools: ToolState[];
  retrievals: RetrievalTrace[];
  token_excerpt: string;
  topology: {
    nodes: Map<string, TopologyNode>;
    edges: Map<string, TopologyEdge>;
  };
  timeline: TimelineItem[];
  log: TimelineItem[];
  errors: string[];
  recent_changes: TimelineItem[];
};

export function createInitialState(): CoreState {
  return {
    run_id: null,
    phase: "idle",
    last_seq: 0,
    totals: {
      input_tokens: 0,
      output_tokens: 0,
      streamed_tokens: 0,
      tool_calls: 0,
      retries: 0,
      retrievals: 0,
      failures: 0
    },
    latency: {
      current_ms: 0,
      max_ms: 0,
      samples: []
    },
    active_tools: [],
    retrievals: [],
    token_excerpt: "",
    topology: createTopology(),
    timeline: [],
    log: [],
    errors: [],
    recent_changes: []
  };
}

export function reduceEvent(state: CoreState, event: AgentEvent): CoreState {
  if (event.seq <= state.last_seq) {
    return state;
  }

  const next: CoreState = {
    ...state,
    topology: cloneTopology(state.topology),
    totals: { ...state.totals },
    latency: { ...state.latency, samples: [...state.latency.samples] },
    active_tools: [...state.active_tools],
    retrievals: [...state.retrievals],
    timeline: [...state.timeline],
    log: [...state.log],
    errors: [...state.errors],
    recent_changes: [...state.recent_changes]
  };

  next.run_id = event.run_id;
  next.last_seq = event.seq;
  applyTopologyEvent(next.topology, event);

  switch (event.kind) {
    case "thinking":
      next.phase = "thinking";
      appendInfo(next, event, event.payload.message);
      break;
    case "retrieval":
      next.phase = "retrieving";
      next.totals.retrievals += 1;
      boundedPush(next.retrievals, { ...event.payload, seq: event.seq }, 12);
      appendInfo(next, event, `${event.payload.source}: ${event.payload.query}`);
      break;
    case "tool_call":
      next.phase = event.payload.status === "failed" ? "recovering" : "tooling";
      next.totals.tool_calls += event.payload.status === "started" ? 1 : 0;
      next.active_tools = upsertTool(next.active_tools, { ...event.payload, seq: event.seq });
      appendInfo(next, event, `${event.payload.name} ${event.payload.status}`);
      break;
    case "retry":
      next.phase = "retrying";
      next.totals.retries += 1;
      appendWarn(next, event, `${event.payload.target}: ${event.payload.reason}`);
      break;
    case "failure":
      next.phase = "failed";
      next.totals.failures += 1;
      boundedPush(next.errors, `${event.payload.component}: ${event.payload.message}`, 8);
      appendError(next, event, `${event.payload.component}: ${event.payload.message}`);
      break;
    case "token":
      next.phase = "streaming";
      next.totals.streamed_tokens += countTokens(event.payload.text);
      next.token_excerpt = (next.token_excerpt + event.payload.text).slice(-420);
      appendInfo(next, event, "token stream");
      break;
    case "usage":
      next.totals.input_tokens += event.payload.input_tokens;
      next.totals.output_tokens += event.payload.output_tokens;
      appendInfo(next, event, "usage updated");
      break;
    case "latency":
      next.latency.current_ms = event.payload.ms;
      next.latency.max_ms = Math.max(next.latency.max_ms, event.payload.ms);
      boundedPush(next.latency.samples, { seq: event.seq, ts_ms: event.ts_ms, ms: event.payload.ms }, 40);
      appendInfo(next, event, `latency ${event.payload.ms}ms`);
      break;
    case "state_transition":
      next.phase = event.payload.phase;
      appendInfo(next, event, event.payload.message ?? event.payload.phase);
      break;
  }

  return next;
}

function upsertTool(tools: ToolState[], tool: ToolState) {
  const without = tools.filter((candidate) => candidate.id !== tool.id);
  const visible = tool.status === "succeeded" ? [...without, tool].slice(-6) : [tool, ...without].slice(0, 6);
  return visible;
}

function appendInfo(state: CoreState, event: AgentEvent, label: string) {
  appendTimeline(state, event, label, "info");
}

function appendWarn(state: CoreState, event: AgentEvent, label: string) {
  appendTimeline(state, event, label, "warn");
}

function appendError(state: CoreState, event: AgentEvent, label: string) {
  appendTimeline(state, event, label, "error");
}

function appendTimeline(state: CoreState, event: AgentEvent, label: string, level: TimelineItem["level"]) {
  const item = { seq: event.seq, ts_ms: event.ts_ms, kind: event.kind, label, level };
  boundedPush(state.timeline, item, 32);
  boundedPush(state.log, item, 24);
  boundedPush(state.recent_changes, item, 10);
}

function boundedPush<T>(target: T[], item: T, max: number) {
  target.push(item);
  while (target.length > max) target.shift();
}

function countTokens(text: string) {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}
