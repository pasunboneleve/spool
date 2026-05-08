---
id: alternate-agent-stream
title: Alternate agent stream
dek: The same article structure can point at a different replay source without changing the renderer.
date: 2026-05-07
tags: [runtime, replay]
default_event_source: alternate-agent-run
---

This article uses the same visualisation types as the default article, but its frontmatter points to another JSONL event source.

::viz{id="system-map" type="topology" title="Where the alternate run is now"}

The prose and visualisation registry stay unchanged. Only the event source reference changes.

::viz{id="run-metrics" type="metrics" title="Alternate run counters"}

::viz{id="token-window" type="tokens" title="Alternate token excerpt"}

::viz{id="recent-events" type="timeline" title="Alternate recent changes"}
