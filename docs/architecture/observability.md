# Observability contract

Spool treats platform behaviour as event data. Console logs are not the observability layer; they are only one possible sink.

## Ownership

`packages/observability` owns provider-neutral platform events, ID helpers, local sinks, and failure drill event generation.

`apps/worker-shell` emits events at platform boundaries: HTTP requests, WebSocket connections, event-source startup, projection broadcasts, and payload measurements.

`apps/frontend` renders a bounded platform trace in the evidence margin. It does not infer platform truth from UI state.

## Event kinds

The local observability contract includes:

- `platform_request_started`
- `platform_request_finished`
- `platform_request_failed`
- `websocket_connected`
- `websocket_closed`
- `websocket_reconnected`
- `event_source_started`
- `event_source_finished`
- `event_source_failed`
- `projection_broadcast`
- `projection_payload_measured`
- `render_cycle_measured`
- `model_request_started`
- `model_request_finished`
- `model_request_failed`
- `provider_rate_limited`
- `provider_timeout`

Each event carries a schema, kind, timestamp, component, correlation ID, and optional run, session, and request IDs.

## Local sinks

The worker writes events to:

- a bounded in-memory sink for live UI streaming
- a bounded JSONL sink for local inspection and replay
- optional stdout JSONL when `SPOOL_OBS_STDOUT=1`

Local endpoints:

```text
GET  /observability/events
GET  /observability/jsonl
POST /drills/:name
```

## Production mapping

The same event categories can later map to:

- Cloudflare Workers Logs
- Tail Workers
- Durable Object logs
- OpenTelemetry export
- stored replay files

The schema should make this mapping boring. A visible UI state should be traceable to structured events with shared IDs.
