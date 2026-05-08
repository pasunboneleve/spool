import { describe, expect, it } from "vitest";
import { parseArticleMarkdown } from "./article";
import { parseJsonlEvents, replayProjection } from "./event-core";

const articleMarkdown = `---
id: sample
title: Sample article
dek: Test article
default_event_source: run-a
---

Intro prose.

::viz{id="map" type="topology" title="Map"}

## Details

More prose.

::viz{id="tokens" type="tokens" event_source="run-b" title="Token window" caption="Bounded text."}
`;

describe("article content model", () => {
  it("parses frontmatter and semantic visualisation embeds", () => {
    const article = parseArticleMarkdown(articleMarkdown);

    expect(article.id).toBe("sample");
    expect(article.default_event_source).toBe("run-a");
    expect(article.blocks).toEqual([
      { kind: "paragraph", text: "Intro prose." },
      { kind: "viz", id: "map", type: "topology", event_source: "run-a", title: "Map", caption: undefined },
      { kind: "heading", level: 2, text: "Details" },
      { kind: "paragraph", text: "More prose." },
      { kind: "viz", id: "tokens", type: "tokens", event_source: "run-b", title: "Token window", caption: "Bounded text." }
    ]);
  });
});

describe("event-core JSONL replay", () => {
  it("validates JSONL events and projects them through the reducer", () => {
    const events = parseJsonlEvents(
      [
        JSON.stringify({
          schema: "spool.agent.v1",
          run_id: "jsonl",
          seq: 1,
          ts_ms: 1,
          kind: "state_transition",
          payload: { phase: "planning" }
        }),
        JSON.stringify({
          schema: "spool.agent.v1",
          run_id: "jsonl",
          seq: 2,
          ts_ms: 2,
          kind: "token",
          payload: { text: "hello stream" }
        })
      ].join("\n")
    );

    const projection = replayProjection(events);
    expect(projection.run_id).toBe("jsonl");
    expect(projection.phase).toBe("streaming");
    expect(projection.totals.streamed_tokens).toBe(2);
    expect(projection.token_excerpt).toBe("hello stream");
  });
});
