# Failure drills

Failure drills prove that platform and provider failures can be represented as Spool events before real Cloudflare deployment.

## Run a drill

Start the local dev server:

```sh
bun run dev
```

Trigger a drill through the worker shell:

```sh
curl -X POST http://localhost:8787/drills/provider_rate_limit
```

Inspect the local event sinks:

```sh
curl http://localhost:8787/observability/events
curl http://localhost:8787/observability/jsonl
```

The frontend evidence margin also receives observability events over `/observability/ws`.

## Available drills

- normal run
- malformed event
- WebSocket disconnect
- model timeout
- provider rate limit
- failed tool call
- failed retrieval
- projection payload too large
- slow event source
- bursty event source

## Acceptance

For each drill:

- a structured event is emitted
- run, session, request, or correlation IDs are present where applicable
- visible state changes where appropriate
- JSONL output contains the relevant IDs
- replay can reconstruct expected projection where applicable
