import type { BlockType } from "@echolore/shared/contracts";
import sanitizeHtml from "sanitize-html";

const VALID_BLOCK_TYPES: ReadonlySet<string> = new Set<BlockType>([
  "text",
  "heading1",
  "heading2",
  "heading3",
  "bulletList",
  "orderedList",
  "numberedList",
  "image",
  "file",
  "code",
  "codeBlock",
  "quote",
  "divider",
]);

/**
 * Inline HTML tags that BlockNote uses for rich-text content.
 * Everything else is stripped.
 */
const INLINE_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["strong", "b", "em", "i", "s", "del", "code", "u", "a", "br", "span"],
  allowedAttributes: {
    a: ["href"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  disallowedTagsMode: "discard",
};

/** Validate block type against the known set. Falls back to "text". */
export function sanitizeBlockType(type: string): BlockType {
  return VALID_BLOCK_TYPES.has(type) ? (type as BlockType) : "text";
}

/** Sanitize inline HTML content from block editor. */
export function sanitizeBlockContent(content: string | null | undefined): string | null {
  if (content == null) return null;
  if (content === "") return "";
  return sanitizeHtml(content, INLINE_HTML_OPTIONS);
}

/** Sanitize URL values in block properties (image src, file href, etc.). */
function sanitizeUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  // Block dangerous schemes
  if (/^\s*javascript\s*:/i.test(trimmed)) return "";
  if (/^\s*data\s*:/i.test(trimmed)) return "";
  if (/^\s*vbscript\s*:/i.test(trimmed)) return "";
  return trimmed;
}

/**
 * Sanitize block properties.
 * URL-bearing fields (src, href) are validated for safe schemes.
 */
export function sanitizeBlockProperties(
  properties: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (properties == null) return null;

  const sanitized: Record<string, unknown> = { ...properties };

  // Sanitize known URL fields
  if ("src" in sanitized) sanitized.src = sanitizeUrl(sanitized.src);
  if ("href" in sanitized) sanitized.href = sanitizeUrl(sanitized.href);
  if ("url" in sanitized) sanitized.url = sanitizeUrl(sanitized.url);

  return sanitized;
}
