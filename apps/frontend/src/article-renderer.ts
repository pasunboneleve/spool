import type { Article, ArticleBlock, ArticleIndexItem, Projection } from "@spool/core";
import type { ObservabilityEvent } from "@spool/observability";
import { renderViz } from "./viz-registry";

export type RenderedArticle = {
  update(projections: ReadonlyMap<string, Projection>): void;
  updateObservability(events: ObservabilityEvent[]): void;
};

export type ArticleShellContext = {
  articles: ArticleIndexItem[];
  activeArticleId: string;
  defaultArticleId: string;
};

export function renderArticle(root: HTMLElement, article: Article, context: ArticleShellContext): RenderedArticle {
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.className = "article-shell";
  shell.innerHTML = `
    <button class="shell-button mobile-index-button" type="button" aria-controls="mobile-drawer" aria-expanded="false">Articles</button>
    <aside class="marginalia-rail" aria-label="Article index" data-open="false" data-pinned="false">
      <button class="shell-button rail-tab" type="button" aria-expanded="false">Articles</button>
      <div class="rail-scroll" tabindex="-1">
        <div class="rail-head">
          <span>Index</span>
          <button class="shell-button rail-pin" type="button" aria-pressed="false">Pin</button>
        </div>
        <div class="reading-progress" aria-label="Reading progress"><i></i></div>
        <nav class="article-index">${renderArticleIndex(context)}</nav>
      </div>
    </aside>
    <div class="drawer-backdrop" hidden></div>
    <aside id="mobile-drawer" class="mobile-drawer" aria-label="Article index" aria-hidden="true">
      <div class="rail-head">
        <span>Articles</span>
        <button class="shell-button drawer-close" type="button">Close</button>
      </div>
      <nav class="article-index">${renderArticleIndex(context)}</nav>
    </aside>
    <header class="article-hero">
      <div>
        <p class="eyebrow">Spool v0 interactive article</p>
        <h1>${escapeHtml(article.title)}</h1>
        ${article.dek ? `<p class="dek">${escapeHtml(article.dek)}</p>` : ""}
      </div>
      <div class="connection"><span id="status-dot"></span><span id="status-text">connecting</span></div>
    </header>
    <div class="runtime-grid">
      <article class="article-body"></article>
      <aside class="evidence-rail" aria-label="Evidence and platform observability">
        <section class="evidence-panel">
          <h2>Platform trace</h2>
          <div id="observability-events" class="event-list"></div>
        </section>
        <section class="evidence-panel">
          <h2>Evidence</h2>
          <div class="evidence-list">${renderEvidenceList(article)}</div>
        </section>
      </aside>
    </div>
  `;

  const body = shell.querySelector<HTMLElement>(".article-body");
  if (!body) throw new Error("article body missing");

  for (const block of article.blocks) {
    body.append(renderBlock(block));
  }

  root.append(shell);
  installNavigationBehaviour(shell);

  return {
    update(projections) {
      for (const viz of body.querySelectorAll<HTMLElement>("[data-viz-id]")) {
        const block = article.blocks.find(
          (candidate): candidate is Extract<ArticleBlock, { kind: "viz" }> =>
            candidate.kind === "viz" && candidate.id === viz.dataset.vizId
        );
        if (block) renderViz(viz.querySelector<HTMLElement>(".viz-content") ?? viz, block, projections.get(block.event_source) ?? null);
      }
    },
    updateObservability(events) {
      renderObservabilityEvents(shell, events);
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

function renderArticleIndex(context: ArticleShellContext) {
  return context.articles
    .map((article) => {
      const active = article.id === context.activeArticleId;
      const latest = article.id === context.defaultArticleId;
      const tags = article.tags.length > 0 ? `<small>${article.tags.map(escapeHtml).join(" · ")}</small>` : "";
      return `
        <a href="/?article=${encodeURIComponent(article.id)}" class="index-link${active ? " active" : ""}" ${active ? 'aria-current="page"' : ""}>
          <span>${escapeHtml(article.title)}</span>
          <em>${article.evidence_available ? "evidence" : "text"}</em>
          ${latest ? "<i>featured</i>" : ""}
          ${tags}
        </a>
      `;
    })
    .join("");
}

function renderEvidenceList(article: Article) {
  const vizBlocks = article.blocks.filter((block): block is Extract<ArticleBlock, { kind: "viz" }> => block.kind === "viz");
  if (vizBlocks.length === 0) return `<p class="quiet">No event evidence referenced.</p>`;
  return vizBlocks
    .map(
      (block) => `
        <p>
          <strong>${escapeHtml(block.title)}</strong>
          <span>${escapeHtml(block.type)} · ${escapeHtml(block.event_source)}</span>
        </p>
      `
    )
    .join("");
}

function installNavigationBehaviour(shell: HTMLElement) {
  const rail = shell.querySelector<HTMLElement>(".marginalia-rail");
  const railTab = shell.querySelector<HTMLButtonElement>(".rail-tab");
  const railPin = shell.querySelector<HTMLButtonElement>(".rail-pin");
  const mobileButton = shell.querySelector<HTMLButtonElement>(".mobile-index-button");
  const drawer = shell.querySelector<HTMLElement>(".mobile-drawer");
  const backdrop = shell.querySelector<HTMLElement>(".drawer-backdrop");
  const drawerClose = shell.querySelector<HTMLButtonElement>(".drawer-close");
  if (!rail || !railTab || !railPin || !mobileButton || !drawer || !backdrop || !drawerClose) return;

  const setRailOpen = (open: boolean) => {
    rail.dataset.open = String(open);
    railTab.setAttribute("aria-expanded", String(open));
  };
  const setPinned = (pinned: boolean) => {
    rail.dataset.pinned = String(pinned);
    railPin.setAttribute("aria-pressed", String(pinned));
    setRailOpen(pinned);
  };
  const setDrawerOpen = (open: boolean) => {
    drawer.setAttribute("aria-hidden", String(!open));
    mobileButton.setAttribute("aria-expanded", String(open));
    backdrop.hidden = !open;
  };

  rail.addEventListener("mouseenter", () => setRailOpen(true));
  rail.addEventListener("mouseleave", () => {
    if (rail.dataset.pinned !== "true") setRailOpen(false);
  });
  rail.addEventListener("focusin", () => setRailOpen(true));
  railTab.addEventListener("click", () => setRailOpen(rail.dataset.open !== "true"));
  railPin.addEventListener("click", () => setPinned(rail.dataset.pinned !== "true"));
  mobileButton.addEventListener("click", () => setDrawerOpen(true));
  drawerClose.addEventListener("click", () => setDrawerOpen(false));
  backdrop.addEventListener("click", () => setDrawerOpen(false));

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setDrawerOpen(false);
      setPinned(false);
      setRailOpen(false);
    }
  });

  shell.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(event.key)) return;
    const links = [...shell.querySelectorAll<HTMLAnchorElement>(".marginalia-rail .index-link")];
    const active = document.activeElement;
    const currentIndex = links.findIndex((link) => link === active);
    if (currentIndex < 0) return;
    event.preventDefault();
    if (event.key === "Enter") {
      links[currentIndex]?.click();
      return;
    }
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? links.length - 1
          : event.key === "ArrowDown"
            ? Math.min(currentIndex + 1, links.length - 1)
            : Math.max(currentIndex - 1, 0);
    links[nextIndex]?.focus();
  });

  let progressQueued = false;
  const updateProgress = () => {
    progressQueued = false;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? Math.min(Math.max(window.scrollY / scrollable, 0), 1) : 0;
    shell.style.setProperty("--reading-progress", String(progress));
  };
  window.addEventListener("scroll", () => {
    if (progressQueued) return;
    progressQueued = true;
    window.requestAnimationFrame(updateProgress);
  });
  updateProgress();
}

function renderObservabilityEvents(shell: HTMLElement, events: ObservabilityEvent[]) {
  const list = shell.querySelector<HTMLElement>("#observability-events");
  if (!list) return;
  const bounded = events.slice(-12).reverse();
  const existing = new Map([...list.children].map((child) => [(child as HTMLElement).dataset.key, child as HTMLElement]));
  const seen = new Set<string>();
  for (const event of bounded) {
    const key = `${event.ts_ms}:${event.kind}:${event.correlation_id}`;
    seen.add(key);
    let row = existing.get(key);
    if (!row) {
      row = document.createElement("p");
      row.dataset.key = key;
    }
    row.className = event.kind.endsWith("_failed") || event.kind.includes("timeout") || event.kind.includes("rate_limited") ? "error" : "info";
    row.innerHTML = `<span>${new Date(event.ts_ms).toLocaleTimeString()}</span><strong>${escapeHtml(event.kind)}</strong>${escapeHtml(
      event.component
    )}`;
    list.append(row);
  }
  for (const [key, row] of existing) {
    if (key && !seen.has(key)) row.remove();
  }
}
