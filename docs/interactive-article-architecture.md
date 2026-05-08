# Interactive article architecture

Spool v0 separates prose, event data, event reduction, visualisation, and layout. The browser remains a projection surface, not the source of truth.

## Decision

Use five independent layers:

```text
content/articles/*.md
  -> article model with frontmatter and semantic visualisation embeds

content/events/*.jsonl
  -> independent replayable event streams

event-core
  -> AgentEvent validation, ordering policy, reducer, bounded projection

viz-registry
  -> maps visualisation type plus projection to a renderer

article renderer
  -> composes prose blocks and visualisation blocks with CSS Grid/Flexbox
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

The article renderer does not know which JSONL file exists. It asks the worker for an article model, then connects to `/ws?source=<default_event_source>`.

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
- event-core can later move behind a Rust/WASM boundary without changing article syntax or visualisation registry contracts.
