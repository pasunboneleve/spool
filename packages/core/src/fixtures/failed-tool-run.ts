import type { AgentEvent } from "../event-schema";

export const failedToolRun = [
  {
    schema: "spool.agent.v1",
    run_id: "failed-tool-run",
    seq: 1,
    ts_ms: 1_700_000_200_001,
    kind: "tool_call",
    payload: { id: "tool-fail", name: "cargo test", status: "started", duration_ms: 0 }
  },
  {
    schema: "spool.agent.v1",
    run_id: "failed-tool-run",
    seq: 2,
    ts_ms: 1_700_000_200_220,
    kind: "tool_call",
    payload: { id: "tool-fail", name: "cargo test", status: "failed", duration_ms: 220 }
  },
  {
    schema: "spool.agent.v1",
    run_id: "failed-tool-run",
    seq: 3,
    ts_ms: 1_700_000_200_260,
    kind: "failure",
    payload: { component: "tool-runner", message: "test command failed" }
  }
] satisfies AgentEvent[];
