import type { Block, Page } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import { type BlockDraft, importPageWithBlocks } from "../../repositories/wiki/wiki-repository.js";
import { parseMarkdown, parseTypst } from "./import-parser.js";

export const IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// ---------------------------------------------------------------------------
// Public error class — route handler can distinguish user-facing errors from
// unexpected internal failures without inspecting message strings.
// ---------------------------------------------------------------------------

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportValidationError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ImportFormat = "markdown" | "typst";

export const IMPORT_ALLOWED_EXTENSIONS = new Set([".md", ".typ", ".typst"]);

const EXTENSION_MAP: Record<string, ImportFormat> = {
  md: "markdown",
  typ: "typst",
  typst: "typst",
};

function detectFormat(filename: string): ImportFormat {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const format = EXTENSION_MAP[ext];
  if (!format) {
    throw new ImportValidationError("Unsupported file format. Use .md, .typ, or .typst");
  }
  return format;
}

function extractTitle(
  blockDrafts: { type: string; content: string | null }[],
  filename: string
): string {
  const heading = blockDrafts.find((b) => b.type.startsWith("heading"));
  if (heading?.content) {
    const plain = heading.content.replace(/<[^>]*>/g, "").trim();
    if (plain) return plain;
  }
  return filename.replace(/\.[^.]+$/, "");
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface ImportResult {
  page: Page;
  blocks: Pick<Block, "id" | "page_id" | "type" | "content" | "properties" | "sort_order">[];
}

export async function importFile(
  fileBuffer: ArrayBuffer,
  filename: string,
  spaceId: string,
  parentId: string | null,
  user: SessionUser
): Promise<ImportResult> {
  if (fileBuffer.byteLength > IMPORT_MAX_FILE_SIZE) {
    throw new ImportValidationError("File too large (max 5MB)");
  }

  const format = detectFormat(filename);
  const source = new TextDecoder("utf-8").decode(fileBuffer);
  const drafts = format === "markdown" ? parseMarkdown(source) : parseTypst(source);
  const title = extractTitle(drafts, filename);
  const now = new Date();

  const blockDrafts: BlockDraft[] = drafts.map((d) => ({
    type: d.type,
    content: d.content,
    properties: d.properties,
  }));

  const result = await importPageWithBlocks({
    pageId: crypto.randomUUID(),
    title,
    spaceId,
    parentId,
    authorId: user.id,
    now,
    blockDrafts,
  });

  return result;
}
