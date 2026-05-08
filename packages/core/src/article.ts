import { z } from "zod";

export const vizTypeSchema = z.enum(["topology", "metrics", "tokens", "timeline"]);
export type VizType = z.infer<typeof vizTypeSchema>;

export const articleFrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  dek: z.string().optional(),
  date: z.string().optional(),
  tags: z.array(z.string()).default([]),
  category: z.string().optional(),
  default_event_source: z.string().optional()
});

export type ArticleFrontmatter = z.infer<typeof articleFrontmatterSchema>;

export type ArticleBlock =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | {
      kind: "viz";
      id: string;
      type: VizType;
      event_source: string;
      title: string;
      caption?: string;
    };

export type Article = ArticleFrontmatter & {
  blocks: ArticleBlock[];
};

export type ArticleIndexItem = ArticleFrontmatter & {
  evidence_available: boolean;
  section_count: number;
};

export type SiteConfig = {
  featured_article?: string;
};

export function parseArticleMarkdown(markdown: string): Article {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const meta = articleFrontmatterSchema.parse(parseFlatFrontmatter(frontmatter));
  const blocks = parseBlocks(body, meta.default_event_source);
  return { ...meta, blocks };
}

export function buildArticleIndex(articles: Article[]): ArticleIndexItem[] {
  return articles
    .map((article) => ({
      id: article.id,
      title: article.title,
      dek: article.dek,
      date: article.date,
      tags: article.tags,
      category: article.category,
      default_event_source: article.default_event_source,
      evidence_available: article.blocks.some((block) => block.kind === "viz"),
      section_count: article.blocks.filter((block) => block.kind === "heading").length
    }))
    .sort(compareArticleIndexItems);
}

export function resolveDefaultArticle(index: ArticleIndexItem[], config: SiteConfig = {}): string {
  if (config.featured_article && index.some((article) => article.id === config.featured_article)) {
    return config.featured_article;
  }
  const latest = [...index].sort(compareArticleIndexItems)[0];
  if (!latest) throw new Error("article index is empty");
  return latest.id;
}

function splitFrontmatter(markdown: string) {
  const normalized = markdown.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error("article frontmatter must start with ---");
  }
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) {
    throw new Error("article frontmatter must end with ---");
  }
  return {
    frontmatter: normalized.slice(4, end).trim(),
    body: normalized.slice(end + 4).trim()
  };
}

function parseFlatFrontmatter(frontmatter: string) {
  const parsed: Record<string, string | string[]> = {};
  for (const line of frontmatter.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    if (separator < 1) throw new Error(`invalid frontmatter line: ${line}`);
    const key = trimmed.slice(0, separator).trim();
    parsed[key] = parseValue(trimmed.slice(separator + 1).trim());
  }
  return parsed;
}

function parseBlocks(body: string, defaultEventSource: string | undefined): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const paragraphs: string[] = [];

  const flushParagraph = () => {
    if (paragraphs.length === 0) return;
    blocks.push({ kind: "paragraph", text: paragraphs.join(" ") });
    paragraphs.length = 0;
  };

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (trimmed.startsWith("::viz{") && trimmed.endsWith("}")) {
      flushParagraph();
      blocks.push(parseVizEmbed(trimmed, defaultEventSource));
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushParagraph();
      blocks.push({ kind: "heading", level: 3, text: trimmed.slice(4).trim() });
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushParagraph();
      blocks.push({ kind: "heading", level: 2, text: trimmed.slice(3).trim() });
      continue;
    }

    if (!trimmed.startsWith("# ")) {
      paragraphs.push(trimmed);
    }
  }

  flushParagraph();
  return blocks;
}

function parseVizEmbed(line: string, defaultEventSource: string | undefined): ArticleBlock {
  const attributes = parseAttributes(line.slice("::viz{".length, -1));
  const type = vizTypeSchema.parse(attributes.type);
  const id = required(attributes, "id");
  return {
    kind: "viz",
    id,
    type,
    event_source: attributes.event_source ?? requiredDefaultEventSource(defaultEventSource, id),
    title: attributes.title ?? id,
    caption: attributes.caption
  };
}

function parseAttributes(raw: string) {
  const attributes: Record<string, string> = {};
  const pattern = /([a-zA-Z_][\w-]*)="([^"]*)"/g;
  for (const match of raw.matchAll(pattern)) {
    const key = match[1];
    const value = match[2];
    if (key && value !== undefined) attributes[key] = value;
  }
  return attributes;
}

function required(attributes: Record<string, string>, key: string) {
  const value = attributes[key];
  if (!value) throw new Error(`viz embed missing ${key}`);
  return value;
}

function unquote(value: string) {
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

function parseValue(value: string) {
  const unquoted = unquote(value);
  if (unquoted.startsWith("[") && unquoted.endsWith("]")) {
    return unquoted
      .slice(1, -1)
      .split(",")
      .map((item) => unquote(item.trim()))
      .filter(Boolean);
  }
  return unquoted;
}

function requiredDefaultEventSource(defaultEventSource: string | undefined, vizId: string) {
  if (!defaultEventSource) throw new Error(`viz embed ${vizId} needs event_source or default_event_source`);
  return defaultEventSource;
}

function compareArticleIndexItems(a: ArticleIndexItem, b: ArticleIndexItem) {
  const byDate = Date.parse(b.date ?? "") - Date.parse(a.date ?? "");
  if (!Number.isNaN(byDate) && byDate !== 0) return byDate;
  if (Number.isNaN(byDate)) {
    const aDate = Date.parse(a.date ?? "");
    const bDate = Date.parse(b.date ?? "");
    if (!Number.isNaN(bDate)) return 1;
    if (!Number.isNaN(aDate)) return -1;
  }
  return a.title.localeCompare(b.title);
}
