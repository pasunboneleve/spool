import type { AgentEvent } from "../event-schema";

export const retrievalHeavyRun = Array.from({ length: 14 }, (_, index) => ({
  schema: "spool.agent.v1",
  run_id: "retrieval-heavy-run",
  seq: index + 1,
  ts_ms: 1_700_000_300_000 + index * 80,
  kind: "retrieval",
  payload: {
    source: index % 2 === 0 ? "README" : "local-cache",
    query: `trace ${index + 1}`,
    score: 0.55 + (index % 4) * 0.1,
    status: index % 3 === 0 ? "partial" : "hit"
  }
})) satisfies AgentEvent[];
