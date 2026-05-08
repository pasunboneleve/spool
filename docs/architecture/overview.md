# Architecture overview

Spool v0 separates prose, event data, platform observability, event reduction, visualisation, and layout. The browser remains a projection surface, not the source of truth.

## Data flow

```text
content/articles/*.md
  -> article model with frontmatter and semantic visualisation embeds

content/events/*.jsonl
  -> independent replayable event streams

local platform mock
  -> provider-neutral observability events

event core
  -> AgentEvent validation, ordering policy, reducer, bounded projection

visualisation registry
  -> maps visualisation type plus projection to a renderer

article renderer
  -> composes prose blocks, visualisation blocks, navigation, and evidence margins
```

Articles may reference event sources and visualisation embeds by ID. Articles do not own event data. Visualisations do not own prose. Visual components receive projections and render them; they do not compute canonical event, topology, retry, failure, token, or phase state.

## Current packages

`packages/core` owns the event-core boundary for v0:

- `AgentEvent` schema validation
- duplicate and out-of-order event policy
- reducer state transitions
- bounded projection output
- topology node and edge status
- JSONL parsing and replay projection tests

`packages/observability` owns provider-neutral platform observability:

- event schema
- run, session, request, and correlation IDs
- bounded memory and JSONL sinks
- local failure drills

`apps/worker-shell` owns local runtime wiring:

- Hono/Bun routing
- article and site loading
- event-source replay
- WebSocket fanout
- projection broadcast
- platform instrumentation

`apps/frontend` owns browser rendering:

- article bootstrapping
- marginal navigation
- evidence rail
- visualisation registry
- SVG topology rendering
- local connection state

## Article index and default route

The worker derives the article index from markdown metadata. It exposes:

- `/site` for site config, article index, and resolved default article
- `/articles` for the article index
- `/articles/:id` for one parsed article model

The frontend root route is not a marketing landing page. `/` renders the configured featured article from `content/site.json`. If no featured article exists, it renders the latest article by frontmatter date.

A query string can choose another ordinary article:

```text
/?article=alternate-agent-stream
```

## Layout

The article renderer uses CSS Grid and Flexbox first. Prose stays in a readable column. Visualisations sit beside the prose on wide screens and collapse into the article flow on narrow screens. Panels have fixed logical regions and internal scrolling, so streaming tokens and logs do not move the article.

Tailwind CSS v4 owns page layout, responsive grids, spacing, typography, panels, metric strips, bounded scroll regions, badges, and tables. D3 and SVG own topology geometry, node and edge coordinates, path generation, and scale/layout helpers.

## Future Cloudflare mapping

- `apps/frontend` maps to Cloudflare Pages.
- `apps/worker-shell` maps to a Cloudflare Worker adapter.
- `content/articles` can become static Pages assets or KV/R2-backed content.
- `content/events` can become fixtures, persisted traces, R2 objects, or Durable Object streams.
- WebSocket fanout and run state can move to Durable Objects.
- Observability events can flow to Workers Logs, Tail Workers, Durable Object logs, OpenTelemetry export, or stored replay files.
- event-core can later move behind a Rust/WASM boundary without changing article syntax or visualisation registry contracts.

The current TypeScript core exists to improve v0 feedback loops. Its event and projection contracts keep the later Rust replacement narrow.
