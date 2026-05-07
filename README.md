# Spool

[![CI](https://github.com/pasunboneleve/spool/actions/workflows/ci.yml/badge.svg)](https://github.com/pasunboneleve/spool/actions/workflows/ci.yml)

Spool is a local-first prototype for a Cloudflare-style realtime blog that visualises AI-agent activity while keeping domain logic in compiler-checked Rust.

The browser is a projection surface, not the source of truth. It renders projections from Rust and local connection state only.

## Architecture

```text
Browser UI
  <- WebSocket /ws ->
Local worker shell (Bun + Hono)
  <- wasm-bindgen JSON API ->
Rust core (state, reducer, projections)
  <- JSONL event stream ->
Mock agent (Rust)
```

## Local startup

## System dependencies

Install these tools before running the project on a new machine:

- Git.
- Rust and Cargo through `rustup`.
- Rust target `wasm32-unknown-unknown`.
- `wasm-pack` `0.14.x`.
- Bun `1.3.x`.
- Chromium or Chrome, optional, for headless visual checks when DevTools MCP cannot launch a browser.

Wrangler, TypeScript, Vite, Hono, and D3 are project dependencies installed by Bun.

Install the Rust target and JavaScript dependencies once:

```sh
rustup target add wasm32-unknown-unknown
bun install
```

Start the prototype:

```sh
bun run dev
```

Then open:

```text
http://localhost:5173
```

The dev command builds the Rust WASM package, builds the mock-agent binary, starts the Hono/Bun worker on `localhost:8787`, and starts the Vite frontend on `localhost:5173`.

## Validation

```sh
bun run check
bun run build
```

`bun run check` runs TypeScript type checks, Rust formatting checks, and Rust tests. `bun run build` builds WASM with:

```sh
wasm-pack build rust-core --target web --out-dir ../app/generated/rust-core
```

The generated WASM package is ignored under `app/generated/`.

## WASM boundary

`rust-core` exposes a narrow JSON-oriented `wasm-bindgen` API:

```text
Engine::new() -> Engine
Engine::ingest(event_json: &str) -> String
Engine::snapshot() -> String
validate_event(event_json: &str) -> String
```

JSON strings are the only cross-boundary domain contract. TypeScript parses and forwards JSON, but it does not compute canonical agent state, retries, phases, metrics, graph edges, or timeline summaries.

Rust does not import browser APIs, Hono types, WebSocket types, DOM state, timers, or framework-specific concepts. Time and ordering enter Rust through explicit event fields.

## Event protocol

Mock-agent events are JSONL frames:

```json
{
  "schema": "spool.agent.v1",
  "run_id": "local-run-compiler-corrected",
  "seq": 1,
  "ts_ms": 1700000000001,
  "kind": "thinking",
  "payload": {
    "message": "Checking compiler boundaries before writing glue code"
  }
}
```

Supported event kinds:

- `thinking`
- `retrieval`
- `tool_call`
- `retry`
- `failure`
- `token`
- `usage`
- `latency`
- `state_transition`

Rust returns projections with run state, token totals, latency samples, active tools, retrieval traces, graph nodes and edges, timeline items, logs, token stream fragments, and visible errors.

## Future Cloudflare mapping

- `frontend` maps to Cloudflare Pages.
- `worker-shell` maps to a Cloudflare Worker adapter.
- The Rust WASM package remains the domain core behind the Worker boundary.
- WebSocket fanout and stateful runs map to Durable Objects.
- The local mock-agent is replaced by a real AI-agent event source.
- Wrangler is kept as a dev dependency so deployment work can be added without changing the domain boundary.

The prototype deliberately avoids Docker Compose, Kubernetes, external queues, databases, and Cloudflare credentials. The local compiler and tests are the first operational guardrail.
