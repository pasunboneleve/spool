import { z } from "zod";

export const vizTypeSchema = z.enum(["topology", "metrics", "tokens", "timeline"]);
export type VizType = z.infer<typeof vizTypeSchema>;

export const articleFrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  dek: z.string().optional(),
  default_event_source: z.string().min(1)
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

export function parseArticleMarkdown(markdown: string): Article {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const meta = articleFrontmatterSchema.parse(parseFlatFrontmatter(frontmatter));
  const blocks = parseBlocks(body, meta.default_event_source);
  return { ...meta, blocks };
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
  const parsed: Record<string, string> = {};
  for (const line of frontmatter.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    if (separator < 1) throw new Error(`invalid frontmatter line: ${line}`);
    const key = trimmed.slice(0, separator).trim();
    parsed[key] = unquote(trimmed.slice(separator + 1).trim());
  }
  return parsed;
}

function parseBlocks(body: string, defaultEventSource: string): ArticleBlock[] {
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

function parseVizEmbed(line: string, defaultEventSource: string): ArticleBlock {
  const attributes = parseAttributes(line.slice("::viz{".length, -1));
  const type = vizTypeSchema.parse(attributes.type);
  const id = required(attributes, "id");
  return {
    kind: "viz",
    id,
    type,
    event_source: attributes.event_source ?? defaultEventSource,
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
