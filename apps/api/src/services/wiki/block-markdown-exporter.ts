import type { Block } from "../../db/schema.js";

/**
 * Wiki BlockNote blocks → Markdown exporter.
 *
 * Used by the MCP `wiki_read_page` tool so external AI agents receive the
 * page structure (headings, lists, code blocks, tables) instead of a
 * stripHtml text soup. Handles the block types produced by the import
 * parser (`import-parser.ts`) and the BlockNote editor's stored HTML subset.
 */

export interface ExportableBlock {
  type: string;
  content: string | null;
  properties: Record<string, unknown> | null;
}

// ─── Inline HTML (BlockNote subset) → Markdown ─────────────────────

const INLINE_MARKDOWN_TAGS: Record<string, [string, string]> = {
  strong: ["**", "**"],
  b: ["**", "**"],
  em: ["*", "*"],
  i: ["*", "*"],
  s: ["~~", "~~"],
  del: ["~~", "~~"],
  strike: ["~~", "~~"],
  code: ["`", "`"],
};

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => HTML_ENTITIES[name] ?? match);
}

function attrValue(attrs: string, name: string): string | null {
  const double = new RegExp(`${name}\\s*=\\s*"([^"]*)"`).exec(attrs);
  if (double?.[1] !== undefined) return decodeEntities(double[1]);
  const single = new RegExp(`${name}\\s*=\\s*'([^']*)'`).exec(attrs);
  if (single?.[1] !== undefined) return decodeEntities(single[1]);
  return null;
}

/** Convert the inline HTML subset stored in block content to markdown. */
export function inlineHtmlToMarkdown(html: string): string {
  let out = "";
  const openTags: Array<{ tag: string; href: string | null }> = [];
  const tagRe = /<(\/?)([a-zA-Z0-9]+)((?:\s[^>]*)?)\/?>/g;
  let lastIndex = 0;
  let match = tagRe.exec(html);

  while (match !== null) {
    out += decodeEntities(html.slice(lastIndex, match.index));
    lastIndex = tagRe.lastIndex;

    const isClosing = (match[1] ?? "") === "/";
    const tag = (match[2] ?? "").toLowerCase();
    const attrs = match[3] ?? "";

    if (tag === "br") {
      out += "\n";
      match = tagRe.exec(html);
      continue;
    }
    if (tag === "img" && !isClosing) {
      const src = attrValue(attrs, "src");
      if (src) out += `![${attrValue(attrs, "alt") ?? ""}](${src})`;
      match = tagRe.exec(html);
      continue;
    }

    const md = INLINE_MARKDOWN_TAGS[tag];
    if (!isClosing) {
      if (md) out += md[0];
      let href: string | null = null;
      if (tag === "a") {
        href = attrValue(attrs, "href");
        out += "[";
      }
      openTags.push({ tag, href });
    } else {
      const openIndex = openTags.map((t) => t.tag).lastIndexOf(tag);
      if (openIndex >= 0) {
        const frame = openTags[openIndex];
        openTags.splice(openIndex, 1);
        if (md) out += md[1];
        if (frame?.href !== null && frame?.href !== undefined) out += `](${frame.href})`;
      }
    }
    match = tagRe.exec(html);
  }
  out += decodeEntities(html.slice(lastIndex));
  // Close any tags left open by malformed content
  for (const frame of openTags.reverse()) {
    const md = INLINE_MARKDOWN_TAGS[frame.tag];
    if (md) out += md[1];
    if (frame.href !== null) out += `)`;
  }
  return out.trim();
}

// ─── Tables (BlockNote tableContent JSON) ──────────────────────────

interface TableInlineItem {
  type?: string;
  text?: string;
  href?: string;
  content?: TableInlineItem[];
}

interface TableContent {
  type?: string;
  rows?: Array<{ cells?: TableInlineItem[] }>;
}

function tableCellToText(items: TableInlineItem[] | undefined): string {
  if (!items) return "";
  return items
    .map((item) => {
      if (item.type === "link" && item.href) {
        const label = tableCellToText(item.content);
        return label || item.href;
      }
      if (typeof item.text === "string") return item.text;
      return tableCellToText(item.content);
    })
    .join("")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

function tableToMarkdown(block: ExportableBlock): string | null {
  if (block.properties?.blockNoteType !== "table" || !block.content) return null;
  let parsed: TableContent;
  try {
    parsed = JSON.parse(block.content) as TableContent;
  } catch {
    return null;
  }
  const rows = (parsed.rows ?? []).map((row) =>
    (row.cells ?? []).map((cell) => tableCellToText([cell]))
  );
  if (rows.length === 0) return null;

  const header = rows[0] as string[];
  const body = rows.slice(1);
  const width = Math.max(header.length, 1);
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  return [
    line(header),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...body.map((cells) => line(cells)),
  ].join("\n");
}

// ─── Blocks → Markdown ─────────────────────────────────────────────

const HEADING_PREFIX: Record<string, string> = {
  heading1: "#",
  heading2: "##",
  heading3: "###",
};

function strProperty(properties: Record<string, unknown> | null, key: string): string | null {
  const value = properties?.[key];
  return typeof value === "string" ? value : null;
}

export function blocksToMarkdown(blocks: ExportableBlock[]): string {
  const parts: string[] = [];
  let orderedCounter = 0;

  for (const block of blocks) {
    if (block.type !== "orderedList") orderedCounter = 0;

    switch (block.type) {
      case "heading1":
      case "heading2":
      case "heading3": {
        const prefix = HEADING_PREFIX[block.type];
        if (block.content) parts.push(`${prefix} ${inlineHtmlToMarkdown(block.content)}`);
        break;
      }
      case "text": {
        const table = tableToMarkdown(block);
        if (table) {
          parts.push(table);
        } else if (block.content) {
          const text = inlineHtmlToMarkdown(block.content);
          if (text) parts.push(text);
        }
        break;
      }
      case "bulletList":
        if (block.content) parts.push(`- ${inlineHtmlToMarkdown(block.content)}`);
        break;
      case "orderedList": {
        orderedCounter += 1;
        if (block.content) parts.push(`${orderedCounter}. ${inlineHtmlToMarkdown(block.content)}`);
        break;
      }
      case "codeBlock": {
        const language = strProperty(block.properties, "language") ?? "";
        const code = block.content ?? "";
        parts.push(`\`\`\`${language}\n${code}\n\`\`\``);
        break;
      }
      case "quote": {
        if (block.content) {
          const text = inlineHtmlToMarkdown(block.content);
          if (text)
            parts.push(
              text
                .split("\n")
                .map((line) => `> ${line}`)
                .join("\n")
            );
        }
        break;
      }
      case "divider":
        parts.push("---");
        break;
      case "image": {
        const src = strProperty(block.properties, "src");
        if (src) {
          const label = strProperty(block.properties, "filename") ?? "";
          parts.push(`![${label}](${src})`);
        }
        break;
      }
      default:
        if (block.content) {
          const text = inlineHtmlToMarkdown(block.content);
          if (text) parts.push(text);
        }
        break;
    }
  }

  return parts.join("\n\n");
}

/** Convenience wrapper for full DB block rows. */
export function pageBlocksToMarkdown(blocks: Block[]): string {
  return blocksToMarkdown(
    blocks.map((b) => ({ type: b.type, content: b.content, properties: b.properties }))
  );
}
