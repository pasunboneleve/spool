import type { ObservabilityEmitter } from "./emit";
import type { ObservabilityEvent } from "./event-schema";
import { createRequestContext } from "./ids";

export const failureDrills = [
  "normal_run",
  "malformed_event",
  "websocket_disconnect",
  "model_timeout",
  "provider_rate_limit",
  "failed_tool_call",
  "failed_retrieval",
  "projection_payload_too_large",
  "slow_event_source",
  "bursty_event_source"
] as const;

export type FailureDrill = (typeof failureDrills)[number];

export function runFailureDrill(drill: FailureDrill, emitter: ObservabilityEmitter): ObservabilityEvent[] {
  const context = createRequestContext({ run_id: `drill_${drill}` });
  const common = {
    ...context,
    component: "local-platform-mock",
    payload: { drill }
  };

  switch (drill) {
    case "normal_run":
      return [
        emitter.emit("platform_request_started", common),
        emitter.emit("projection_broadcast", { ...common, payload: { drill, bytes: 512 } }),
        emitter.emit("platform_request_finished", common)
      ];
    case "malformed_event":
      return [emitter.emit("event_source_failed", { ...common, payload: { drill, reason: "invalid JSONL event" } })];
    case "websocket_disconnect":
      return [emitter.emit("websocket_closed", { ...common, payload: { drill, code: 1006 } })];
    case "model_timeout":
      return [emitter.emit("provider_timeout", { ...common, component: "model-adapter" })];
    case "provider_rate_limit":
      return [emitter.emit("provider_rate_limited", { ...common, component: "model-adapter" })];
    case "failed_tool_call":
      return [emitter.emit("model_request_failed", { ...common, component: "tool-adapter" })];
    case "failed_retrieval":
      return [emitter.emit("event_source_failed", { ...common, component: "retrieval-adapter" })];
    case "projection_payload_too_large":
      return [emitter.emit("projection_payload_measured", { ...common, payload: { drill, bytes: 2_000_000, limit: 1_000_000 } })];
    case "slow_event_source":
      return [emitter.emit("event_source_started", { ...common, payload: { drill, cadence_ms: 1_500 } })];
    case "bursty_event_source":
      return [emitter.emit("event_source_started", { ...common, payload: { drill, burst_size: 50 } })];
  }
}
