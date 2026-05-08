# AGENTS.md

## Project purpose

Spool is an interactive article runtime for explaining live systems.

It is not a dashboard bolted onto a blog post.

Spool combines narrative, event streams, platform observability, model/tool activity, and live/replayed visual evidence to make dynamic technical systems legible.

The project exists to answer:

```text
What happened?
Where did it happen?
What changed?
What failed?
What is stale?
What evidence supports the explanation?
```

## Architectural constitution

Keep these sources of truth separate:

1. narrative content
2. event sources
3. model/tool adapters
4. platform observability
5. event validation and reduction
6. bounded projections
7. visualisations
8. article layout

Do not hardcode article-specific events into UI code.

Do not make visual components own canonical state.

Do not make the browser infer domain truth from presentation state.

Do not let model calls bypass the event system.

Do not hide platform failures behind console logs only.

Do not collapse markdown, event streams, model calls, observability, and visualisation layout into one component for convenience.

The core architecture is:

```text
content source
+ event source
+ model/tool source/sink
+ platform observability source
→ event core
→ bounded projections
→ visualisation registry
→ article layout renderer
```

The browser is a projection surface, not the source of truth.

## Source boundaries

### Content source

Markdown files provide narrative.

Markdown may include:

* frontmatter
* semantic visualisation embeds
* references to event source IDs
* references to model interaction IDs
* references to platform/session/run IDs

Markdown must not contain canonical event arrays, reducer logic, provider-specific model calls, or visualisation state.

Example:

```markdown
---
title: "Watching an agent retry"
event_sources:
  retry_demo: ./events/retry-demo.jsonl
---

The interesting thing is not that the tool failed. It is whether the failure stayed local.

::viz{type="topology" source="retry_demo"}

::viz{type="timeline" source="retry_demo"}
```

Articles reference evidence. They do not own it.

### Event sources

Event sources emit structured events.

Examples:

* JSONL replay files
* mock agent streams
* live WebSocket streams
* model adapters
* tool adapters
* retrieval adapters
* platform observability adapters
* future Cloudflare Worker and Durable Object streams

Event sources must be replaceable without editing visual components.

The same event source should be able to power multiple visualisations.

The same article should be able to reference different event sources without changing the article renderer.

### Model adapters

AI models are ordinary event sources and sinks.

A model adapter may consume:

* article context
* user input
* prompt templates
* retrieval results
* prior events
* platform/session/run context

A model adapter must emit structured events.

Provider-specific code belongs inside adapters.

Provider SDKs and API-specific response formats must not leak into visualisation components, article rendering, or event-core reducers.

Provider-neutral events should cross the system boundary.

Model calls must be observable through events.

At minimum, model adapters should emit:

```text
model_request_started
model_token
model_response
model_usage
model_latency
model_request_finished
model_request_failed
model_refusal
provider_rate_limited
provider_timeout
```

If tools are involved, emit:

```text
tool_call_started
tool_call_finished
tool_call_failed
tool_result
retry
```

If retrieval is involved, emit:

```text
retrieval_request_started
retrieval_result
retrieval_request_finished
retrieval_request_failed
```

Do not hide model calls behind opaque helper functions that return only final text.

Spool should be able to show what happened.

### Platform observability sources

Platform behaviour is part of the event graph.

Workers, Durable Objects, WebSockets, model adapters, retrieval adapters, article renderers, event sources, and projection broadcasters should emit provider-neutral platform events where useful.

At minimum, observable platform events should include:

```text
platform_request_started
platform_request_finished
platform_request_failed
websocket_connected
websocket_closed
websocket_reconnected
durable_object_woke
durable_object_hibernated
projection_broadcast
event_source_started
event_source_finished
event_source_failed
projection_payload_measured
render_cycle_measured
```

Every external call should carry a correlation ID.

Every user-visible run/session should have a run ID.

Every browser connection should have a connection/session ID.

Logs, traces, and Spool events should share IDs so a visible state can be traced back to platform logs.

Do not rely on console logs as the only observability layer.

Spool’s own event model is the first observability layer. Cloudflare, local logs, JSONL files, OpenTelemetry, or other systems are sinks for that observability data.

## Local observability contract

Local development must test the shape of production observability.

Do not pretend local development exactly reproduces Cloudflare production behaviour.

Instead, ensure the local system emits the same categories of structured events and IDs that production will need.

A local observability harness should support:

* structured event emission
* request IDs
* run IDs
* session IDs
* correlation IDs
* JSONL logging
* live in-app observability panels where useful
* replayable event files
* failure drills

Local sinks may include:

```text
stdout JSONL
content/events/*.jsonl
in-memory dev event stream
dev observability panel
test fixtures
```

Production sinks may include:

```text
Cloudflare Workers Logs
Cloudflare tailing/log streams
OpenTelemetry export
external logging/trace systems
stored replay files
```

The event schema should make this mapping boring.

### Local observability acceptance

For any platform-facing feature, be able to answer locally:

```text
Did the request start?
Did it finish?
What failed?
Which run/session/request did it belong to?
Which model/tool/retrieval call was involved?
Was a projection broadcast?
Was the browser connected?
Can the visible UI state be correlated with logs/events?
Can the event log be replayed?
```

Failure drills should include:

* normal run
* model timeout
* provider rate limit
* malformed event
* WebSocket disconnect
* worker/server restart
* projection payload too large
* slow event source
* bursty event source
* failed tool call
* failed retrieval

For each drill, acceptance is:

* structured event emitted
* IDs are present and correlated
* visible state changes where appropriate
* log/event line contains the relevant IDs
* replay can reproduce the state where applicable

## Event core

The event core owns:

* schemas
* validation
* ordering policy
* duplicate handling
* retry accounting
* failure accounting
* usage aggregation
* topology state
* platform state
* bounded projections
* replay behaviour

The event core must be deterministic and testable.

The event core should not import browser APIs, DOM APIs, visualisation code, provider SDKs, or platform SDKs.

The event core receives facts. It does not fetch them.

## Projections

Projections are bounded views of event state.

Totals may grow.

Rendered collections must be bounded.

Examples:

```text
recent_changes: last N
token_excerpt: last N tokens/chars
event_log: last N
retrievals: active + recent
timeline: sampled or bounded
topology: current node/edge state
platform: current request/session/connection state
```

Do not send or render unbounded transcripts as the default UI.

Do not let streaming text resize the page grid.

Do not make every consumer parse full historical event streams unless replay is explicitly requested.

## Visualisations

Visualisations render projections.

They may own:

* geometry
* animation state
* hover/focus state
* local selection state
* responsive rendering concerns

They must not own:

* canonical agent phase
* canonical topology state
* platform request state
* retry/failure accounting
* token/usage totals
* event ordering policy
* provider-specific response interpretation

Visualisations should make state legible without becoming the state owner.

## Layout

The article layout renderer composes text and visualisation blocks.

Use ordinary CSS Grid/Flexbox first.

Tailwind may be used for:

* layout
* spacing
* typography
* panels
* bounded scroll regions
* responsive behaviour
* status badges
* tables

Use specialised layout libraries such as Pretext only after a spike proves they remove complexity.

Pretext must not become the architecture.

It is only a possible implementation detail for adaptive text/visual layout.

## Realtime rendering rules

Realtime UI should consume events continuously but paint deliberately.

The correct browser-side pattern is:

```text
incoming event/projection
→ store latest projection or enqueue bounded update
→ requestAnimationFrame
→ keyed/persistent DOM/SVG update
```

Do not render directly inside WebSocket `onmessage`.

Do not rebuild the whole SVG/DOM tree on every event.

Do not append unbounded text into page layout.

Use bounded panels with internal scrolling.

Use keyed joins or persistent elements for SVG/DOM hot paths.

For D3/SVG work, prefer stable identity:

```ts
selection
  .data(nodes, node => node.id)
  .join(...)
```

If the UI feels slow, investigate in this order:

1. render frequency
2. full DOM/SVG rebuilds
3. layout/reflow from growing panels
4. projection payload size
5. event burstiness
6. console/log spam
7. dev-mode overhead
8. reducer/runtime language performance

Do not treat sluggish UI as proof that a different language or runtime is required until render architecture has been inspected.

## Technology choices

Technology choices are implementation details, not constitutional commitments.

Choose tools that preserve the project boundaries.

Current implementation may use:

* Bun
* Hono
* Vite
* Tailwind
* D3 helpers
* SVG/Canvas
* WebSocket transport
* schema validation
* deterministic tests
* replay fixtures

Compiled cores, Rust, WASM, Cloudflare Workers, Durable Objects, external model providers, or other runtimes may be introduced when they reduce complexity or enforce boundaries.

Do not introduce a technology because it is interesting.

Do introduce a technology when it makes the architecture cheaper to change, easier to test, easier to observe, or easier to explain.

## Package boundaries

Suggested structure:

```text
/content/articles
  markdown sources

/content/events
  JSONL replayable event streams

/packages/article-model
  markdown parsing, frontmatter, semantic embeds

/packages/event-core
  schemas, reducer, projections, replay

/packages/model-adapters
  provider-neutral model adapter interfaces and provider-specific adapters

/packages/observability
  IDs, structured events, local sinks, trace/log helpers

/packages/viz-registry
  topology, timeline, token stream, metric renderers

/packages/layout-engine
  article renderer and responsive layout helpers

/apps/worker-shell
  Hono/server shell, WebSocket fanout, event source wiring

/apps/frontend
  article view and rendered browser UI
```

Keep dependencies pointing inward.

Visualisation packages may depend on projection types.

Event core must not depend on visualisation packages.

Model adapters must emit events into event core rather than directly updating UI.

Platform adapters must emit observability events rather than hiding behaviour in logs only.

## Local development

Use a long-lived dev session.

Prefer:

```bash
bun run dev
```

Do not repeatedly start and stop the dev server on every iteration.

After code changes:

1. let the dev server hot reload
2. read logs from the existing session
3. inspect the rendered page
4. fix observed issues
5. run deterministic checks before claiming completion

Use:

```bash
bun run typecheck
bun run test
bun run build
bun run check
```

`bun run check` should be the deterministic local validation path.

## Browser inspection

For frontend, layout, SVG, Canvas, D3, WebSocket, or realtime work, rendered-page inspection is mandatory.

Preferred:

1. Chrome DevTools MCP
2. user-started browser with remote debugging
3. `xvfb-run` for headful browser/MCP when no X server is available
4. headless Chromium screenshots and DOM metrics

Do not claim visual completion from successful typecheck/build alone.

Check:

* desktop width
* narrow/mobile width
* zoom-equivalent states around 80%, 100%, 125%, and 150%
* streaming load
* error state
* reconnect state
* content-heavy state

Acceptance:

* no overlapping text
* no layout jumps from streaming content
* no unexpected horizontal overflow
* bounded panels stay bounded
* topology remains readable
* active/stale/failed states are clear
* visible state can be correlated with events/logs when relevant

## Tests

Prefer deterministic judges.

Add tests for:

* schema validation
* invalid event rejection
* reducer transitions
* duplicate event policy
* out-of-order event policy
* retry accounting
* failure accounting
* model usage accounting
* model failure/refusal events
* platform request events
* WebSocket connection events
* projection broadcast events
* bounded projection output
* replay fixtures
* golden projection snapshots

Do not close work without running the relevant checks.

## Observability tests

When changing model adapters, event sources, platform adapters, WebSocket handling, projection broadcasting, or article runtime behaviour, add or update tests that prove observability is intact.

At minimum, tests should prove:

* IDs are created and propagated
* failures produce structured events
* model/tool/retrieval/platform events can be correlated by run/session/request IDs
* local JSONL or in-memory sinks receive the expected events
* replay fixtures can reconstruct the expected projection
* bounded projections remain bounded under long or bursty streams

Do not accept “it logged an error” as sufficient.

The error must be structured, correlated, and visible through the event/projection system where appropriate.

## Documentation

Documentation should explain architecture through boundaries.

Use concise, direct prose.

Prefer:

* README as synopsis
* docs/ for deeper architecture notes
* examples that show content/events/viz decoupling
* examples that show local observability and replay

When updating architecture, document:

* what boundary changed
* what now owns canonical state
* what remains replaceable
* how to validate it
* how to observe it locally
* how it maps to production observability sinks

## Commit discipline

Work in small logical changes.

Do not push unless explicitly asked.

Before committing:

* run relevant checks
* inspect rendered UI when visual changes are involved
* summarize validation
* note remaining uncertainty
* note observability evidence when platform/model/event behaviour changed

## Guiding principle

Cheap change comes from keeping sources of truth local and explicit.

Narrative can change without changing events.

Events can change without changing layout.

Visualisations can change without changing prose.

Model providers can change without changing articles.

Platform providers can change without changing the event model.

Layout can change without changing the event core.

Observability sinks can change without changing what the system observes.

Do not trade that locality away for short-term convenience.
