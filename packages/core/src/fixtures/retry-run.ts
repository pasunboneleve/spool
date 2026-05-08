import type { AgentEvent } from "../event-schema";

export const retryRun = [
  {
    schema: "spool.agent.v1",
    run_id: "retry-run",
    seq: 1,
    ts_ms: 1_700_000_100_001,
    kind: "thinking",
    payload: { message: "preparing tool call" }
  },
  {
    schema: "spool.agent.v1",
    run_id: "retry-run",
    seq: 2,
    ts_ms: 1_700_000_100_110,
    kind: "tool_call",
    payload: { id: "tool-retry", name: "fetch", status: "started", duration_ms: 0 }
  },
  {
    schema: "spool.agent.v1",
    run_id: "retry-run",
    seq: 3,
    ts_ms: 1_700_000_100_210,
    kind: "retry",
    payload: { target: "fetch", reason: "transient timeout" }
  },
  {
    schema: "spool.agent.v1",
    run_id: "retry-run",
    seq: 4,
    ts_ms: 1_700_000_100_350,
    kind: "tool_call",
    payload: { id: "tool-retry", name: "fetch", status: "succeeded", duration_ms: 620 }
  }
] satisfies AgentEvent[];
