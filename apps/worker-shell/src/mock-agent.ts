import type { AgentEvent } from "@spool/core";

const baseTs = 1_700_001_000_000;
const tokenText = [
  "Events enter the reducer. ",
  "The projection stays canonical. ",
  "The browser renders a map. ",
  "Stale paths quiet down. ",
  "Failures remain visible. "
];

export type MockAgent = AsyncGenerator<AgentEvent, void, void>;

export async function* createMockAgent(signal: AbortSignal): MockAgent {
  let seq = 0;
  const runId = "local-typescript-v0";

  while (!signal.aborted) {
    for (const event of cycle(runId, seq, baseTs + seq * 100)) {
      if (signal.aborted) return;
      seq = event.seq;
      yield event;
      await Bun.sleep(delayFor(event));
    }
  }
}

function delayFor(event: AgentEvent) {
  if (event.kind === "token") return 90;
  if (event.kind === "latency" || event.kind === "usage") return 120;
  return 170;
}

function cycle(runId: string, startSeq: number, startTs: number): AgentEvent[] {
  let seq = startSeq;
  const next = (kind: AgentEvent["kind"], payload: AgentEvent["payload"], offset: number): AgentEvent => ({
    schema: "spool.agent.v1",
    run_id: runId,
    seq: ++seq,
    ts_ms: startTs + offset,
    kind,
    payload
  } as AgentEvent);

  const events: AgentEvent[] = [
    next("state_transition", { phase: "planning", message: "planning local-first response" }, 0),
    next("thinking", { message: "reading event history and current topology" }, 120),
    next("retrieval", { source: "README", query: "projection model", score: 0.86, status: "hit" }, 240),
    next("retrieval", { source: "local-cache", query: "recent agent traces", score: 0.63, status: "partial" }, 360),
    next("tool_call", { id: `tool-${seq + 1}`, name: "fixture replay", status: "started", duration_ms: 0 }, 480),
    next("usage", { input_tokens: 160, output_tokens: 18 }, 560),
    next("latency", { ms: 180 + (seq % 5) * 37 }, 640)
  ];

  for (const text of tokenText) {
    events.push(next("token", { text }, 720 + events.length * 90));
  }

  if (seq % 2 === 0) {
    events.push(next("retry", { target: "fixture replay", reason: "temporary stale projection" }, 1_400));
  }
  if (seq % 3 === 0) {
    events.push(next("failure", { component: "retriever", message: "fallback trace missed expected context" }, 1_520));
  }

  events.push(next("tool_call", { id: `tool-${startSeq + 5}`, name: "fixture replay", status: "succeeded", duration_ms: 520 }, 1_660));
  events.push(next("state_transition", { phase: "complete", message: "projection broadcast" }, 1_780));
  return events;
}
