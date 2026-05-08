import type { AgentEvent } from "../event-schema";

export const outOfOrderRun = [
  {
    schema: "spool.agent.v1",
    run_id: "out-of-order-run",
    seq: 1,
    ts_ms: 1_700_000_500_001,
    kind: "thinking",
    payload: { message: "first event" }
  },
  {
    schema: "spool.agent.v1",
    run_id: "out-of-order-run",
    seq: 1,
    ts_ms: 1_700_000_500_002,
    kind: "thinking",
    payload: { message: "duplicate should be ignored" }
  },
  {
    schema: "spool.agent.v1",
    run_id: "out-of-order-run",
    seq: 3,
    ts_ms: 1_700_000_500_003,
    kind: "usage",
    payload: { input_tokens: 10, output_tokens: 4 }
  },
  {
    schema: "spool.agent.v1",
    run_id: "out-of-order-run",
    seq: 2,
    ts_ms: 1_700_000_500_004,
    kind: "failure",
    payload: { component: "core", message: "late event should be ignored" }
  }
] satisfies AgentEvent[];
