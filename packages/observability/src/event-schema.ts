import { z } from "zod";

export const platformEventKinds = [
  "platform_request_started",
  "platform_request_finished",
  "platform_request_failed",
  "websocket_connected",
  "websocket_closed",
  "websocket_reconnected",
  "event_source_started",
  "event_source_finished",
  "event_source_failed",
  "projection_broadcast",
  "projection_payload_measured",
  "render_cycle_measured",
  "model_request_started",
  "model_request_finished",
  "model_request_failed",
  "provider_rate_limited",
  "provider_timeout"
] as const;

export const observabilityEventSchema = z.object({
  schema: z.literal("spool.observability.v1"),
  kind: z.enum(platformEventKinds),
  ts_ms: z.number().int().nonnegative(),
  run_id: z.string().min(1).optional(),
  session_id: z.string().min(1).optional(),
  request_id: z.string().min(1).optional(),
  correlation_id: z.string().min(1),
  component: z.string().min(1),
  payload: z.record(z.unknown()).default({})
});

export type PlatformEventKind = (typeof platformEventKinds)[number];
export type ObservabilityEvent = z.infer<typeof observabilityEventSchema>;

export function parseObservabilityEvent(input: unknown): ObservabilityEvent {
  return observabilityEventSchema.parse(input);
}
