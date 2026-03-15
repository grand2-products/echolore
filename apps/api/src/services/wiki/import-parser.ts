import type { Content, ListItem, PhrasingContent, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
/**
 * Markdown / Typst → BlockDraft[] parser for wiki page import.
 */
import { unified } from "unified";

export const MAX_BLOCKS = 500;

/** Pre-built remark pipeline — reused across calls to avoid reconstruction. */
const remarkProcessor = unified().use(remarkParse).use(remarkGfm);

const HEADING_TYPE_MAP: Record<number, string> = {
  1: "heading1",
  2: "heading2",
  3: "heading3",
};

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface BlockDraft {
  type: string;
  content: string | null;
  properties: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Block collector — shared by both parsers to enforce the limit in one place
// ---------------------------------------------------------------------------

class BlockCollector {
  readonly blocks: BlockDraft[] = [];

  push(b: BlockDraft) {
    if (this.blocks.length < MAX_BLOCKS) this.blocks.push(b);
  }

  heading(depth: number, content: string) {
    this.push({
      type: HEADING_TYPE_MAP[Math.min(depth, 3)] ?? "heading",
      content,
      properties: null,
    });
  }

  text(content: string) {
    this.push({ type: "text", content, properties: null });
  }

  list(ordered: boolean, content: string) {
    this.push({ type: ordered ? "orderedList" : "bulletList", content, properties: null });
  }

  code(value: string, lang: string | null) {
    this.push({ type: "codeBlock", content: value, properties: lang ? { language: lang } : null });
  }

  quote(content: string) {
    this.push({ type: "quote", content, properties: null });
  }

  divider() {
    this.push({ type: "divider", content: null, properties: null });
  }

  image(src: string, filename: string | null) {
    this.push({ type: "image", content: null, properties: { src, filename } });
  }
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function phrasingToHtml(nodes: PhrasingContent[]): string {
  return nodes.map(phrasingNodeToHtml).join("");
}

function phrasingNodeToHtml(node: PhrasingContent): string {
  switch (node.type) {
    case "text":
      return escapeHtml(node.value);
    case "strong":
      return `<strong>${phrasingToHtml(node.children)}</strong>`;
    case "emphasis":
      return `<em>${phrasingToHtml(node.children)}</em>`;
    case "delete":
      return `<s>${phrasingToHtml(node.children)}</s>`;
    case "inlineCode":
      return `<code>${escapeHtml(node.value)}</code>`;
    case "link":
      return `<a href="${escapeHtml(node.url)}">${phrasingToHtml(node.children)}</a>`;
    case "image":
      return `<img src="${escapeHtml(node.url)}" alt="${escapeHtml(node.alt ?? "")}" />`;
    case "break":
      return "<br />";
    default: {
      const n = node as unknown as Record<string, unknown>;
      if (Array.isArray(n.children)) return phrasingToHtml(n.children as PhrasingContent[]);
      if (typeof n.value === "string") return escapeHtml(n.value);
      return "";
    }
  }
}

function listItemToHtml(item: ListItem): string {
  return item.children
    .map((child) => {
      if (child.type === "paragraph") return phrasingToHtml(child.children);
      if (child.type === "list") return child.children.map(listItemToHtml).join("; ");
      return "";
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Markdown parser
// ---------------------------------------------------------------------------

export function parseMarkdown(source: string): BlockDraft[] {
  const tree = remarkProcessor.parse(source) as Root;
  const c = new BlockCollector();

  function walk(nodes: Content[]) {
    for (const node of nodes) {
      switch (node.type) {
        case "heading":
          c.heading(node.depth, phrasingToHtml(node.children));
          break;
        case "paragraph":
          if (node.children.length === 1 && node.children[0]?.type === "image") {
            const img = node.children[0];
            c.image(img.url, img.alt || null);
          } else {
            c.text(phrasingToHtml(node.children));
          }
          break;
        case "list":
          for (const item of node.children) {
            c.list(Boolean(node.ordered), listItemToHtml(item));
          }
          break;
        case "code":
          c.code(node.value, node.lang ?? null);
          break;
        case "blockquote": {
          const inner = node.children
            .filter(
              (ch): ch is Extract<typeof ch, { type: "paragraph" }> => ch.type === "paragraph"
            )
            .map((ch) => phrasingToHtml(ch.children))
            .join("<br />");
          c.quote(inner);
          break;
        }
        case "thematicBreak":
          c.divider();
          break;
        case "image":
          c.image(node.url, node.alt || null);
          break;
        default:
          break;
      }
    }
  }

  walk(tree.children);
  return c.blocks;
}

// ---------------------------------------------------------------------------
// Typst parser (line-based)
// ---------------------------------------------------------------------------

/** Regex that matches the start of any "special" Typst line. */
const TYPST_SPECIAL_LINE = /^(?:={1,3}\s|[-+]\s|```|---|#(?:line|image)\()/;

export function parseTypst(source: string): BlockDraft[] {
  const lines = source.split("\n");
  const c = new BlockCollector();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Code block
    const codeMatch = line.match(/^```(\w*)$/);
    if (codeMatch) {
      const lang = codeMatch[1] || null;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]?.startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      c.code(codeLines.join("\n"), lang);
      continue;
    }

    // Divider
    const trimmed = line.trim();
    if (/^---+$/.test(trimmed) || trimmed.startsWith("#line(")) {
      c.divider();
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(={1,3})\s+(.+)$/);
    if (headingMatch) {
      c.heading((headingMatch[1] ?? "=").length, typstInlineToHtml((headingMatch[2] ?? "").trim()));
      i++;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^-\s+(.+)$/);
    if (ulMatch) {
      c.list(false, typstInlineToHtml(ulMatch[1] ?? ""));
      i++;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\+\s+(.+)$/);
    if (olMatch) {
      c.list(true, typstInlineToHtml(olMatch[1] ?? ""));
      i++;
      continue;
    }

    // Image
    const imageMatch = line.match(/^#image\("([^"]+)"\)/);
    if (imageMatch) {
      c.image(imageMatch[1] ?? "", null);
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Plain text paragraph — collect consecutive non-special lines
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]?.trim() !== "" &&
      !TYPST_SPECIAL_LINE.test(lines[i] ?? "")
    ) {
      paraLines.push(lines[i] ?? "");
      i++;
    }
    c.text(typstInlineToHtml(paraLines.join(" ")));
  }

  return c.blocks;
}

function typstInlineToHtml(text: string): string {
  let result = escapeHtml(text);
  result = result.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
  result = result.replace(/_([^_]+)_/g, "<em>$1</em>");
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  return result;
}
