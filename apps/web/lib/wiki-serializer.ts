/**
 * Serialization layer: BlockNote block JSON <-> backend BlockDto
 */

import type { Block as BlockNoteBlock } from "@blocknote/core";
import type { BlockDto } from "@contracts/index";

// Use a loose type for BlockNote inline content to avoid generic arity issues
type InlineItem = {
  type: string;
  text?: string;
  href?: string;
  styles?: Record<string, boolean>;
  content?: InlineItem[];
};

// ---------------------------------------------------------------------------
// BlockDto -> BlockNote block conversion
// ---------------------------------------------------------------------------

function htmlToInlineContent(html: string): InlineItem[] {
  if (!html) return [];

  // Simple: if no HTML tags, return plain text
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return [{ type: "text" as const, text: unescapeHtml(html), styles: {} }];
  }

  // Parse HTML inline content
  if (typeof window === "undefined") {
    return [{ type: "text" as const, text: stripHtml(html), styles: {} }];
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const result: InlineItem[] = [];

  function processNode(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) result.push({ type: "text" as const, text, styles: {} });
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === "a") {
      const href = el.getAttribute("href") ?? "";
      const linkContent: InlineItem[] = [];
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          linkContent.push({
            type: "text" as const,
            text: child.textContent ?? "",
            styles: {},
          });
        }
      }
      result.push({
        type: "link" as const,
        href,
        content:
          linkContent.length > 0
            ? linkContent
            : [{ type: "text" as const, text: href, styles: {} }],
      } as InlineItem);
      return;
    }

    // For styled elements, extract styles and apply to children
    if (["strong", "b", "em", "i", "s", "del", "code", "u"].includes(tag)) {
      const styleKey =
        tag === "strong" || tag === "b"
          ? "bold"
          : tag === "em" || tag === "i"
            ? "italic"
            : tag === "s" || tag === "del"
              ? "strike"
              : tag === "code"
                ? "code"
                : "underline";

      const text = el.textContent ?? "";
      if (text) {
        result.push({
          type: "text" as const,
          text,
          styles: { [styleKey]: true },
        });
      }
      return;
    }

    for (const child of Array.from(el.childNodes)) {
      processNode(child);
    }
  }

  for (const child of Array.from(doc.body.childNodes)) {
    processNode(child);
  }

  return result.length > 0
    ? result
    : [{ type: "text" as const, text: stripHtml(html), styles: {} }];
}

function stripHtml(html: string): string {
  return unescapeHtml(html.replace(/<[^>]*>/g, ""));
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Converts a backend BlockDto to a BlockNote Block.
 *
 * The `as unknown as BlockNoteBlock` casts below are necessary because
 * BlockNote's `Block` type is a complex discriminated union mapped over the
 * full block/inline/style schema.  Hand-constructed object literals cannot
 * satisfy the union without exhaustively specifying every default prop.
 * The shapes returned here are correct at runtime and accepted by the editor.
 */
function blockDtoToBlockNote(dto: BlockDto): BlockNoteBlock {
  const props = dto.properties ?? {};

  switch (dto.type) {
    case "heading1":
    case "heading2":
    case "heading3": {
      const level = Number.parseInt(dto.type.replace("heading", ""), 10);
      return {
        id: dto.id,
        type: "heading",
        props: { level },
        content: dto.content ? [{ type: "text" as const, text: dto.content, styles: {} }] : [],
        children: [],
      } as unknown as BlockNoteBlock;
    }

    case "bulletList": {
      return {
        id: dto.id,
        type: "bulletListItem",
        props: {},
        content: dto.content ? htmlToInlineContent(dto.content) : [],
        children: [],
      } as unknown as BlockNoteBlock;
    }

    case "orderedList":
    case "numberedList": {
      return {
        id: dto.id,
        type: "numberedListItem",
        props: {},
        content: dto.content ? htmlToInlineContent(dto.content) : [],
        children: [],
      } as unknown as BlockNoteBlock;
    }

    case "image": {
      const src = (props.src as string) ?? "";
      const filename = (props.filename as string) ?? dto.content ?? "";
      return {
        id: dto.id,
        type: "image",
        props: {
          url: src,
          name: filename,
          caption: "",
          previewWidth: 512,
          showPreview: true,
        },
        content: undefined,
        children: [],
      } as unknown as BlockNoteBlock;
    }

    case "file": {
      const mediaType = props.mediaType as string | undefined;
      const href = (props.href as string) ?? "";
      const filename = (props.filename as string) ?? dto.content ?? "";

      if (mediaType === "audio" || mediaType === "video") {
        return {
          id: dto.id,
          type: mediaType,
          props: { url: href, name: filename },
          content: undefined,
          children: [],
        } as unknown as BlockNoteBlock;
      }

      return {
        id: dto.id,
        type: "file",
        props: { url: href, name: filename },
        content: undefined,
        children: [],
      } as unknown as BlockNoteBlock;
    }

    case "codeBlock":
    case "code": {
      const language = (props.language as string) ?? "";
      return {
        id: dto.id,
        type: "codeBlock",
        props: { language },
        content: dto.content ? [{ type: "text" as const, text: dto.content, styles: {} }] : [],
        children: [],
      } as unknown as BlockNoteBlock;
    }

    default: {
      // Check if it's a serialized table
      if (props.blockNoteType === "table" && dto.content) {
        try {
          const parsed = JSON.parse(dto.content);
          return parsed as BlockNoteBlock;
        } catch {
          // Fall through to paragraph
        }
      }

      return {
        id: dto.id,
        type: "paragraph",
        props: {},
        content: dto.content ? htmlToInlineContent(dto.content) : [],
        children: [],
      } as unknown as BlockNoteBlock;
    }
  }
}

export function blockDtosToBlocks(dtos: BlockDto[]): BlockNoteBlock[] {
  const sorted = [...dtos].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.map(blockDtoToBlockNote);
}
