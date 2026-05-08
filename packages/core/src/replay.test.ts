import { describe, expect, it } from "vitest";
import { agentEventSchema, parseAgentEvent } from "./event-schema";
import { project } from "./projection";
import { createInitialState, reduceEvent, type CoreState } from "./reducer";
import { failedToolRun } from "./fixtures/failed-tool-run";
import { normalRun } from "./fixtures/normal-run";
import { outOfOrderRun } from "./fixtures/out-of-order-run";
import { retrievalHeavyRun } from "./fixtures/retrieval-heavy-run";
import { retryRun } from "./fixtures/retry-run";
import { tokenHeavyRun } from "./fixtures/token-heavy-run";

describe("AgentEvent schema v1", () => {
  it("accepts valid events", () => {
    expect(agentEventSchema.safeParse(normalRun[0]).success).toBe(true);
  });

  it("rejects invalid payloads", () => {
    const invalid = { ...normalRun[0], payload: {} };
    expect(agentEventSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("core reducer and projection", () => {
  it("projects a normal run", () => {
    const projection = replay(normalRun);
    expect(projection).toMatchSnapshot();
    expect(projection.phase).toBe("complete");
    expect(projection.totals.input_tokens).toBe(120);
    expect(projection.totals.streamed_tokens).toBe(4);
  });

  it("accounts for retries", () => {
    const projection = replay(retryRun);
    expect(projection.phase).toBe("tooling");
    expect(projection.totals.retries).toBe(1);
    expect(projection.topology.edges.find((edge) => edge.from === "worker-shell" && edge.to === "core")?.retry_count).toBe(1);
  });

  it("accounts for failures", () => {
    const projection = replay(failedToolRun);
    expect(projection.phase).toBe("failed");
    expect(projection.totals.failures).toBe(1);
    expect(projection.errors).toEqual(["tool-runner: test command failed"]);
    expect(projection.topology.nodes.find((node) => node.id === "tool-runner")?.status).toBe("failed");
  });

  it("bounds retrieval traces", () => {
    const projection = replay(retrievalHeavyRun);
    expect(projection.totals.retrievals).toBe(14);
    expect(projection.retrievals).toHaveLength(12);
    expect(projection.retrievals[0]?.seq).toBe(3);
  });

  it("bounds token excerpts without losing totals", () => {
    const projection = replay(tokenHeavyRun);
    expect(projection.totals.streamed_tokens).toBe(80);
    expect(projection.token_excerpt.length).toBeLessThanOrEqual(420);
    expect(projection.token_excerpt).toContain("token-80");
  });

  it("ignores duplicate and out-of-order events", () => {
    const projection = replay(outOfOrderRun);
    expect(projection.last_seq).toBe(3);
    expect(projection.totals.input_tokens).toBe(10);
    expect(projection.totals.failures).toBe(0);
    expect(projection.log.map((item) => item.seq)).toEqual([1, 3]);
  });

  it("marks inactive topology as stale after later events", () => {
    const projection = replay([
      ...normalRun,
      {
        schema: "spool.agent.v1",
        run_id: "normal-run",
        seq: 25,
        ts_ms: 1_700_000_009_000,
        kind: "latency",
        payload: { ms: 320 }
      }
    ]);
    expect(projection.topology.nodes.find((node) => node.id === "retriever")?.status).toBe("stale");
  });
});

function replay(events: unknown[]) {
  const finalState = events.map(parseAgentEvent).reduce<CoreState>((state, event) => reduceEvent(state, event), createInitialState());
  return project(finalState);
}
