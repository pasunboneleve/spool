import type { AgentEvent } from "../event-schema";

export const normalRun = [
  {
    schema: "spool.agent.v1",
    run_id: "normal-run",
    seq: 1,
    ts_ms: 1_700_000_000_001,
    kind: "state_transition",
    payload: { phase: "planning", message: "planning the answer" }
  },
  {
    schema: "spool.agent.v1",
    run_id: "normal-run",
    seq: 2,
    ts_ms: 1_700_000_000_120,
    kind: "thinking",
    payload: { message: "reading local context" }
  },
  {
    schema: "spool.agent.v1",
    run_id: "normal-run",
    seq: 3,
    ts_ms: 1_700_000_000_210,
    kind: "retrieval",
    payload: { source: "README", query: "architecture", score: 0.82, status: "hit" }
  },
  {
    schema: "spool.agent.v1",
    run_id: "normal-run",
    seq: 4,
    ts_ms: 1_700_000_000_350,
    kind: "tool_call",
    payload: { id: "tool-1", name: "search", status: "started", duration_ms: 0 }
  },
  {
    schema: "spool.agent.v1",
    run_id: "normal-run",
    seq: 5,
    ts_ms: 1_700_000_000_460,
    kind: "usage",
    payload: { input_tokens: 120, output_tokens: 14 }
  },
  {
    schema: "spool.agent.v1",
    run_id: "normal-run",
    seq: 6,
    ts_ms: 1_700_000_000_540,
    kind: "latency",
    payload: { ms: 180 }
  },
  {
    schema: "spool.agent.v1",
    run_id: "normal-run",
    seq: 7,
    ts_ms: 1_700_000_000_620,
    kind: "token",
    payload: { text: "The core owns state. " }
  },
  {
    schema: "spool.agent.v1",
    run_id: "normal-run",
    seq: 8,
    ts_ms: 1_700_000_000_760,
    kind: "tool_call",
    payload: { id: "tool-1", name: "search", status: "succeeded", duration_ms: 410 }
  },
  {
    schema: "spool.agent.v1",
    run_id: "normal-run",
    seq: 9,
    ts_ms: 1_700_000_000_900,
    kind: "state_transition",
    payload: { phase: "complete", message: "projection ready" }
  }
] satisfies AgentEvent[];
