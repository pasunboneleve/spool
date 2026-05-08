# Spool

[![CI](https://github.com/pasunboneleve/spool/actions/workflows/ci.yml/badge.svg)](https://github.com/pasunboneleve/spool/actions/workflows/ci.yml)

Spool v0 is a local-first runtime for interactive technical articles. It composes markdown prose, replayable event streams, local platform observability, and live visualisations into a quiet reading surface.

The browser is a projection surface, not the source of truth.

## Architecture

```text
content/articles/*.md
  -> article model and article index
content/events/*.jsonl
  -> event-core reducer and projection
local platform mock
  -> provider-neutral observability events
  -> apps/worker-shell WebSocket broadcast
  -> apps/frontend article shell, margins, and viz registry
```

The TypeScript event-core owns canonical event state, ordering, totals, retries, failures, topology status, logs, and bounded excerpts. The observability package owns provider-neutral platform events, IDs, local sinks, and drills. The worker shell handles routing, article loading, event-source replay, platform instrumentation, WebSocket fanout, and projection broadcast. The frontend renders article blocks, marginal navigation, evidence margins, projections, and local connection state.

Tailwind CSS v4 owns page layout, responsive grids, spacing, typography, panels, metric strips, bounded scroll regions, badges, and table styling. D3 and SVG own topology geometry, node and edge coordinates, path generation, and scale/layout helpers.

## Repository layout

```text
packages/core
  article.ts        markdown/frontmatter article model parser
  event-core.ts     JSONL replay and reducer boundary
  event-schema.ts   AgentEvent v1 schema
  reducer.ts        canonical state transitions
  projection.ts     read model for the UI
  topology.ts       core-owned topology status
  fixtures/         replay fixtures
  replay.test.ts    reducer, schema, topology, and golden projection tests

packages/observability
  event-schema.ts   provider-neutral platform event schema
  ids.ts            run/session/request/correlation ID helpers
  sinks/            local memory and JSONL sinks
  failure-drills.ts local failure drill event generation

apps/worker-shell
  server.ts         Hono/Bun local server
  websocket.ts      WebSocket fanout
  mock-agent.ts     paced local event-source replay

apps/frontend
  src/main.ts       article boot and WebSocket adapter
  src/article-renderer.ts
  src/viz-registry.ts
  src/topology-view.ts
  src/styles.css    Tailwind v4 design system plus scoped SVG map styling

content/articles
  *.md              prose plus semantic visualisation embeds

content/events
  *.jsonl           independent replayable event streams
```

See [docs/interactive-article-architecture.md](docs/interactive-article-architecture.md) for the architecture decision, content syntax, event source boundary, visualisation registry, marginal navigation, local observability contract, Pretext spike decision, and future Cloudflare mapping.

## System dependencies

Install these tools before running the project on a new machine:

- Git.
- Bun `1.3.x`.
- Chromium or Chrome, optional, for rendered-page checks when DevTools MCP cannot launch a browser.

Wrangler, TypeScript, Vite, Tailwind CSS v4, Hono, D3, zod, and vitest are project dependencies installed by Bun. Rust, WASM, wasm-pack, and wasm-bindgen are not used in v0.

Install dependencies once:

```sh
bun install
```

Start the local dev loop:

```sh
bun run dev
```

Then open:

```text
http://localhost:5173
```

The dev command starts the Hono/Bun worker on `localhost:8787` and the Vite frontend on `localhost:5173`. `/` resolves to the featured article from `content/site.json`; if no featured article is configured, it resolves to the latest article by frontmatter date. Keep this session running while editing UI or realtime behaviour. Read its logs after each change instead of starting competing dev servers.

## Validation

```sh
bun run typecheck
bun run test
bun run build
bun run check
```

`bun run check` is the deterministic local validation path. It runs typechecking, vitest, and production builds.

Frontend changes also require rendered-page inspection. Check desktop, mobile, zoom-equivalent layouts, realtime streaming, reconnect/error visibility, bounded scroll regions, and topology readability.

## Event protocol

Events use `AgentEvent` schema v1:

```json
{
  "schema": "spool.agent.v1",
  "run_id": "local-typescript-v0",
  "seq": 1,
  "ts_ms": 1700001000001,
  "kind": "thinking",
  "payload": {
    "message": "reading event history and current topology"
  }
}
```

Common fields:

- `schema`
- `run_id`
- `seq`
- `ts_ms`
- `kind`
- `payload`

Supported kinds:

- `thinking`
- `retrieval`
- `tool_call`
- `retry`
- `failure`
- `token`
- `usage`
- `latency`
- `state_transition`

The reducer ignores duplicate and out-of-order events by sequence number.

## Projection model

The core projects state for the browser:

- `run_id`
- `phase`
- `totals`
- `latency`
- `active_tools`
- `retrievals`
- `topology`
- `timeline`
- `log`
- `errors`
- `recent_changes`
- `token_excerpt`

Topology is core-owned. The frontend may calculate SVG geometry, but it must not infer canonical node or edge state.

Initial topology:

- browser
- worker-shell
- core
- mock-agent
- retriever
- model
- tool-runner

Node and edge statuses are `active`, `idle`, `stale`, or `failed`.

## Local dev workflow

Use one long-lived session:

```sh
bun run dev
```

Then iterate:

1. Let Bun/Vite hot reload.
2. Read the existing dev server logs.
3. Inspect the live page in a browser.
4. Check WebSocket connection state and streaming behaviour.
5. Fix observed layout or runtime issues.
6. Run deterministic checks before finishing.

Do not treat a clean build as visual validation. The app is only visually validated after inspecting the rendered page.

## Future Cloudflare mapping

- `apps/frontend` maps to Cloudflare Pages.
- `apps/worker-shell` maps to a Cloudflare Worker adapter.
- WebSocket fanout and stateful runs can move to Durable Objects.
- The mock event generator can be replaced by a real AI-agent event source.
- Local observability events can map to Workers Logs, Tail Workers, Durable Object logs, OpenTelemetry export, or stored replay files.
- `packages/core` is the future Rust/WASM replacement point.

The current TypeScript core exists to improve v0 feedback loops. Its event and projection contracts keep the later Rust replacement narrow.
