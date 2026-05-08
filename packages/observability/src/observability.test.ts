import { describe, expect, it } from "vitest";
import { createEmitter } from "./emit";
import { parseObservabilityEvent } from "./event-schema";
import { runFailureDrill } from "./failure-drills";
import { createRequestContext } from "./ids";
import { JsonlSink } from "./sinks/jsonl";
import { MemorySink } from "./sinks/memory";

describe("observability events", () => {
  it("validates provider-neutral platform events", () => {
    const context = createRequestContext({ run_id: "run_1" });
    const event = parseObservabilityEvent({
      schema: "spool.observability.v1",
      kind: "platform_request_started",
      ts_ms: 1,
      ...context,
      component: "worker-shell",
      payload: { path: "/articles/example" }
    });

    expect(event.request_id).toMatch(/^req_/);
    expect(event.correlation_id).toMatch(/^corr_/);
  });

  it("writes bounded events to memory and JSONL sinks", () => {
    const memory = new MemorySink(2);
    const jsonl = new JsonlSink(2);
    const emitter = createEmitter([memory, jsonl]);
    const context = createRequestContext({ run_id: "run_1" });

    emitter.emit("platform_request_started", { ...context, component: "worker-shell" });
    emitter.emit("projection_broadcast", { ...context, component: "worker-shell", payload: { bytes: 123 } });
    emitter.emit("platform_request_finished", { ...context, component: "worker-shell" });

    expect(memory.list()).toHaveLength(2);
    expect(jsonl.list()).toHaveLength(2);
    expect(JSON.parse(jsonl.list()[1] ?? "{}").kind).toBe("platform_request_finished");
  });

  it("emits correlated failure drill events", () => {
    const memory = new MemorySink();
    const emitter = createEmitter([memory]);
    const events = runFailureDrill("provider_rate_limit", emitter);

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("provider_rate_limited");
    expect(events[0]?.run_id).toBe("drill_provider_rate_limit");
    expect(memory.list()[0]?.correlation_id).toBe(events[0]?.correlation_id);
  });
});
