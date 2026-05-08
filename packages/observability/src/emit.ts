import { observabilityEventSchema, type ObservabilityEvent, type PlatformEventKind } from "./event-schema";
import type { IdContext } from "./ids";

export type EventSink = {
  write(event: ObservabilityEvent): void;
};

export type ObservabilityEmitter = {
  emit(kind: PlatformEventKind, fields: EmitFields): ObservabilityEvent;
};

export type EmitFields = Partial<IdContext> & {
  component: string;
  payload?: Record<string, unknown>;
  ts_ms?: number;
};

export function createEmitter(sinks: EventSink[]): ObservabilityEmitter {
  return {
    emit(kind, fields) {
      const event = observabilityEventSchema.parse({
        schema: "spool.observability.v1",
        kind,
        ts_ms: fields.ts_ms ?? Date.now(),
        run_id: fields.run_id,
        session_id: fields.session_id,
        request_id: fields.request_id,
        correlation_id: fields.correlation_id,
        component: fields.component,
        payload: fields.payload ?? {}
      });
      for (const sink of sinks) sink.write(event);
      return event;
    }
  };
}
