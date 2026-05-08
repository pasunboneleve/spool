import { describe, expect, it } from "vitest";
import { buildArticleIndex, parseArticleMarkdown, resolveDefaultArticle } from "./article";
import { parseJsonlEvents, replayProjection } from "./event-core";

const articleMarkdown = `---
id: sample
title: Sample article
dek: Test article
default_event_source: run-a
date: 2026-05-08
tags: [agents, observability]
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
    expect(article.tags).toEqual(["agents", "observability"]);
    expect(article.blocks).toEqual([
      { kind: "paragraph", text: "Intro prose." },
      { kind: "viz", id: "map", type: "topology", event_source: "run-a", title: "Map", caption: undefined },
      { kind: "heading", level: 2, text: "Details" },
      { kind: "paragraph", text: "More prose." },
      { kind: "viz", id: "tokens", type: "tokens", event_source: "run-b", title: "Token window", caption: "Bounded text." }
    ]);
  });

  it("builds an article index and resolves featured or latest articles", () => {
    const older = parseArticleMarkdown(`---
id: older
title: Older article
date: 2026-05-01
---

Standalone prose.
`);
    const newer = parseArticleMarkdown(`---
id: newer
title: Newer article
date: 2026-05-03
default_event_source: run-a
---

::viz{id="map" type="topology" title="Map"}
`);

    const index = buildArticleIndex([older, newer]);

    expect(index.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(index[0]?.evidence_available).toBe(true);
    expect(index[1]?.evidence_available).toBe(false);
    expect(resolveDefaultArticle(index)).toBe("newer");
    expect(resolveDefaultArticle(index, { featured_article: "older" })).toBe("older");
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
