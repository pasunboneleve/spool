import type { AgentEvent } from "../event-schema";

export const tokenHeavyRun = Array.from({ length: 80 }, (_, index) => ({
  schema: "spool.agent.v1",
  run_id: "token-heavy-run",
  seq: index + 1,
  ts_ms: 1_700_000_400_000 + index * 35,
  kind: "token",
  payload: { text: `token-${index + 1} ` }
})) satisfies AgentEvent[];
