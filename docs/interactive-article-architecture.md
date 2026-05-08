# Interactive article architecture

Spool v0 separates prose, event data, event reduction, visualisation, and layout. The browser remains a projection surface, not the source of truth.

## Decision

Use five independent layers:

```text
content/articles/*.md
  -> article model with frontmatter and semantic visualisation embeds

content/events/*.jsonl
  -> independent replayable event streams

local platform mock
  -> provider-neutral observability events

event-core
  -> AgentEvent validation, ordering policy, reducer, bounded projection

viz-registry
  -> maps visualisation type plus projection to a renderer

article renderer
  -> composes prose blocks, visualisation blocks, and marginal evidence surfaces
```

Articles may reference event sources and visualisation embeds by ID. Articles do not own event data. Visualisations do not own prose. Visual components receive projections and render them; they do not compute canonical event, topology, retry, failure, token, or phase state.

## Content source

Articles live in `content/articles/*.md`.

Each article starts with flat frontmatter:

```yaml
---
id: compiler-corrected-agent-stream
title: Compiler-corrected agent stream
dek: A local-first interactive article.
date: 2026-05-08
tags: [agents, observability]
default_event_source: sample-agent-run
---
```

The markdown body supports prose, `##` and `###` headings, and semantic visualisation embeds:

```md
::viz{id="system-map" type="topology" title="Where the system is now"}
::viz{id="run-metrics" type="metrics" title="Run counters"}
```

An embed may override the article default event source:

```md
::viz{id="token-window" type="tokens" event_source="alternate-run" title="Token excerpt"}
```

## Event source

Event streams live in `content/events/*.jsonl`. Each non-empty line is one `AgentEvent` object. The worker shell loads the selected source, validates each line through event-core, and replays it as a paced local stream.

The article renderer does not know which JSONL files exist. It asks the worker for an article model, discovers the event source IDs referenced by visualisation embeds, and connects to `/ws?source=<event_source_id>` for each source.

## Article index and default route

The worker derives the article index from markdown metadata. It exposes:

- `/site` for site config, article index, and resolved default article.
- `/articles` for the index.
- `/articles/:id` for one parsed article model.

The frontend root route is not a marketing landing page. `/` renders the configured featured article from `content/site.json`. If no featured article exists, it renders the latest article by frontmatter date. A query string can choose another ordinary article:

```text
/?article=alternate-agent-stream
```

## Marginal navigation

The left margin is navigation apparatus. It is recessed during reading, exposes a persistent `Articles` tab, expands on hover or focus, and can be pinned open. It contains the article index, evidence indicators, tags, featured marker, and reading progress. Keyboard support covers Tab entry, arrow movement, Home/End, Enter, and Escape.

On narrow screens the article index moves into a drawer opened by an `Articles` button. The drawer scrolls internally and closes with Escape, a close button, or the backdrop.

## Event-core boundary

`packages/core` is the event-core boundary for v0. It owns:

- `AgentEvent` schema validation.
- duplicate and out-of-order event policy.
- reducer state transitions.
- bounded projection output.
- topology node and edge status.
- JSONL parsing and replay projection tests.

The worker shell calls `createEventCore().reduce(event)` and broadcasts the resulting projection. The frontend receives projections and renders them.

## Visualisation registry

The frontend registry maps semantic visualisation types to renderers:

- `topology`
- `metrics`
- `tokens`
- `timeline`

The same event source can power multiple embeds. A topology map, metric strip, token excerpt, and timeline can all consume the same projection without sharing UI state.

## Layout

The article renderer uses ordinary CSS Grid and Flexbox first. Prose stays in a readable column. Visualisations sit beside the prose on wide screens and collapse into the article flow on narrow screens. Panels have fixed logical regions and internal scrolling, so streaming tokens and logs do not move the article.

The right margin is evidence apparatus. It shows compact platform observability and event-source evidence. These panels are bounded and scroll internally.

## Local observability contract

`packages/observability` defines provider-neutral platform events:

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

Each event carries a schema, kind, timestamp, component, correlation ID, and optional run, session, and request IDs. The worker writes events to a bounded in-memory sink and a JSONL sink. The frontend subscribes to `/observability/ws` and renders a bounded platform trace in the evidence margin.

Local endpoints:

```text
GET  /observability/events
GET  /observability/jsonl
POST /drills/:name
```

Available drills include normal run, malformed event, WebSocket disconnect, model timeout, provider rate limit, failed tool call, failed retrieval, projection payload too large, slow event source, and bursty event source.

## Pretext spike

Pretext is deferred for v0. The spike did not show enough benefit to justify making it foundational:

- CSS Grid already handles the current prose-plus-visualisation layout.
- The renderer remains small without a layout DSL.
- A Pretext dependency would add a second layout model before the article needs it.

Revisit Pretext when articles need adaptive placement rules that CSS Grid cannot express clearly, such as semantic sidenotes that bind to multiple visualisation anchors across breakpoints.

## Future Cloudflare mapping

- `apps/frontend` maps to Cloudflare Pages.
- `apps/worker-shell` maps to a Cloudflare Worker adapter.
- `content/articles` can become static Pages assets or KV/R2-backed content.
- `content/events` can become fixtures, persisted traces, R2 objects, or Durable Object streams.
- WebSocket fanout and run state can move to Durable Objects.
- Observability events can flow to Workers Logs, Tail Workers, Durable Object logs, OpenTelemetry export, or stored replay files.
- event-core can later move behind a Rust/WASM boundary without changing article syntax or visualisation registry contracts.
