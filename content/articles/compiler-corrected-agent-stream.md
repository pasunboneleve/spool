---
id: compiler-corrected-agent-stream
title: Compiler-corrected agent stream
dek: A local-first interactive article where prose, event streams, and visualisations stay independently replaceable.
date: 2026-05-08
tags: [agents, observability]
default_event_source: sample-agent-run
---

Spool treats an article as prose plus references. The markdown does not own the event stream, and the visualisations do not own the explanation. The event source can change while the article renderer remains the same.

::viz{id="system-map" type="topology" title="Where the system is now" caption="The topology projection marks the active component, quiet paths, stale paths, and failures."}

The first-glance question is operational: where is the agent now, what just changed, and what has failed or gone stale? The reducer owns those answers. The browser renders the projection.

::viz{id="run-metrics" type="metrics" title="Run counters" caption="The same event source also drives totals, retries, failures, and latency."}

## Reading the stream

Tokens are useful as evidence, not as an unbounded transcript. Spool keeps a bounded excerpt and separate totals so streaming text does not move the article around.

::viz{id="token-window" type="tokens" title="Bounded token excerpt" caption="The excerpt scrolls inside its region and never becomes article layout state."}

## Recent movement

The timeline shows recent state transitions, retrievals, tools, retries, and failures from the same replayable JSONL source.

::viz{id="recent-events" type="timeline" event_source="alternate-agent-run" title="Alternate recent changes" caption="This embed intentionally points at another event source while the article renderer stays unchanged."}
