import type { Article, ArticleBlock, Projection } from "@spool/core";
import { renderViz } from "./viz-registry";

export type RenderedArticle = {
  update(projections: ReadonlyMap<string, Projection>): void;
};

export function renderArticle(root: HTMLElement, article: Article): RenderedArticle {
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.className = "article-shell";
  shell.innerHTML = `
    <header class="article-hero">
      <div>
        <p class="eyebrow">Spool v0 interactive article</p>
        <h1>${escapeHtml(article.title)}</h1>
        ${article.dek ? `<p class="dek">${escapeHtml(article.dek)}</p>` : ""}
      </div>
      <div class="connection"><span id="status-dot"></span><span id="status-text">connecting</span></div>
    </header>
    <article class="article-body"></article>
  `;

  const body = shell.querySelector<HTMLElement>(".article-body");
  if (!body) throw new Error("article body missing");

  for (const block of article.blocks) {
    body.append(renderBlock(block));
  }

  root.append(shell);

  return {
    update(projections) {
      for (const viz of body.querySelectorAll<HTMLElement>("[data-viz-id]")) {
        const block = article.blocks.find(
          (candidate): candidate is Extract<ArticleBlock, { kind: "viz" }> =>
            candidate.kind === "viz" && candidate.id === viz.dataset.vizId
        );
        if (block) renderViz(viz.querySelector<HTMLElement>(".viz-content") ?? viz, block, projections.get(block.event_source) ?? null);
      }
    }
  };
}

function renderBlock(block: ArticleBlock) {
  if (block.kind === "heading") {
    const heading = document.createElement(block.level === 2 ? "h2" : "h3");
    heading.textContent = block.text;
    return heading;
  }

  if (block.kind === "paragraph") {
    const paragraph = document.createElement("p");
    paragraph.className = "prose";
    paragraph.textContent = block.text;
    return paragraph;
  }

  const figure = document.createElement("figure");
  figure.className = `viz-panel viz-${block.type}`;
  figure.dataset.vizId = block.id;
  figure.dataset.eventSource = block.event_source;
  figure.innerHTML = `
    <figcaption>
      <strong>${escapeHtml(block.title)}</strong>
      ${block.caption ? `<span>${escapeHtml(block.caption)}</span>` : ""}
    </figcaption>
    <div class="viz-content"></div>
  `;
  return figure;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
