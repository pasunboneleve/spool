import type { AgentEvent } from "@spool/core";

export type MockAgent = AsyncGenerator<AgentEvent, void, void>;

export async function* createMockAgent(events: AgentEvent[], signal: AbortSignal): MockAgent {
  let seq = 0;
  let cycleIndex = 0;

  if (events.length === 0) {
    throw new Error("event source is empty");
  }

  while (!signal.aborted) {
    const baseSeq = seq;
    const firstTs = events[0]?.ts_ms ?? 0;
    const cycleTs = Date.now();
    for (const event of events) {
      if (signal.aborted) return;
      const rebased = {
        ...event,
        seq: baseSeq + event.seq,
        ts_ms: cycleTs + Math.max(event.ts_ms - firstTs, 0)
      } satisfies AgentEvent;
      seq = rebased.seq;
      yield rebased;
      await Bun.sleep(delayFor(rebased));
    }
    cycleIndex += 1;
  }
}

function delayFor(event: AgentEvent) {
  if (event.kind === "token") return 90;
  if (event.kind === "latency" || event.kind === "usage") return 120;
  return 170;
}
