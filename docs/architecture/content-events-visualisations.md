# Content, events, and visualisations

Spool keeps narrative, evidence, and rendering separate.

## Ownership

Markdown articles own prose and semantic references.

Event sources own facts. Current sources are JSONL replay files, but the boundary also fits live WebSocket streams, model adapters, tool adapters, retrieval adapters, and platform observability streams.

The event core owns validation, ordering, reduction, topology state, retry/failure accounting, usage totals, and bounded projections.

Visualisations own geometry, interaction state, and rendering. They do not own canonical event state.

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

Articles can include semantic visualisation embeds:

```md
::viz{id="system-map" type="topology" title="Where the system is now"}
::viz{id="run-metrics" type="metrics" title="Run counters"}
```

An embed can override the article default event source:

```md
::viz{id="token-window" type="tokens" event_source="alternate-run" title="Token excerpt"}
```

Articles reference evidence. They do not own event data, reducer logic, provider calls, or visualisation state.

## Event source

Event streams live in `content/events/*.jsonl`. Each non-empty line is one `AgentEvent`.

The worker shell loads the selected source, validates each event through `packages/core`, and replays the stream at a local demo cadence.

The article renderer does not know which JSONL files exist. It receives an article model, reads the event source IDs referenced by visualisation embeds, and connects to `/ws?source=<event_source_id>` for each source.

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

Rendered collections are bounded. Totals may grow; transcripts, logs, timelines, retrieval lists, and recent-change lists must not grow without limit.

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

## Replaceability

The same event source can power multiple visualisations. The same article can reference a different event source without changing the article renderer. A new visualisation can consume existing projections without changing prose.
