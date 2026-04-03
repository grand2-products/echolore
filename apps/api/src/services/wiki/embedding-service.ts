import { embedText, getEmbeddingConfig, isEmbeddingEnabled } from "../../ai/embeddings.js";
import { stripHtml } from "../../lib/html-utils.js";
import {
  deletePageEmbeddingsByPageId,
  getPageBlocks,
  getPageById,
  listNonDeletedPageIds,
  replacePageEmbeddings,
} from "../../repositories/wiki/wiki-repository.js";

const MAX_CHUNK_CHARS = 1500;
const CHUNK_OVERLAP = 200;

/**
 * Extract plain text from all blocks of a page, with title prepended.
 */
export async function extractPagePlainText(pageId: string): Promise<string | null> {
  const page = await getPageById(pageId);
  if (!page || page.deletedAt) return null;

  const pageBlocks = await getPageBlocks(pageId);

  const blockTexts = pageBlocks.map((b) => (b.content ? stripHtml(b.content) : "")).filter(Boolean);

  const fullText = [page.title, ...blockTexts].join("\n\n");
  return fullText.trim() || null;
}

/**
 * Split text into overlapping chunks suitable for embedding.
 */
export function chunkText(
  text: string,
  maxChars: number = MAX_CHUNK_CHARS,
  overlap: number = CHUNK_OVERLAP
): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChars;

    // Try to break at a paragraph or sentence boundary
    if (end < text.length) {
      const segment = text.slice(start, end);
      const lastParagraph = segment.lastIndexOf("\n\n");
      const lastNewline = segment.lastIndexOf("\n");
      const lastPeriod = segment.lastIndexOf("。");
      const lastDot = segment.lastIndexOf(". ");

      const breakPoint = Math.max(lastParagraph, lastNewline, lastPeriod, lastDot);
      if (breakPoint > maxChars * 0.3) {
        end = start + breakPoint + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    const nextStart = end - overlap;
    // Guard: always advance by at least 1 character to prevent infinite loop
    start = nextStart > start ? nextStart : start + maxChars;

    if (start >= text.length) break;
  }

  return chunks.filter((c) => c.length > 0);
}

export async function indexPage(pageId: string): Promise<void> {
  if (!(await isEmbeddingEnabled())) return;

  const plainText = await extractPagePlainText(pageId);
  if (!plainText) {
    await deletePageEmbeddings(pageId);
    return;
  }

  const chunks = chunkText(plainText);
  const { model: modelId, dimensions } = await getEmbeddingConfig();
  const now = new Date();

  const embeddings: { chunkIndex: number; text: string; vector: number[] }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkText_ = chunks[i];
    if (!chunkText_) continue;
    const vector = await embedText(chunkText_, {
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: dimensions,
    });
    if (vector) {
      embeddings.push({ chunkIndex: i, text: chunkText_, vector });
    }
  }

  if (embeddings.length === 0) return;

  await replacePageEmbeddings(
    pageId,
    embeddings.map((e) => ({
      chunkIndex: e.chunkIndex,
      plainText: e.text,
      embedding: e.vector,
      modelId,
      createdAt: now,
      updatedAt: now,
    }))
  );
}

/**
 * Fire-and-forget wrapper for indexPage with structured logging.
 * Use this from route handlers instead of `void indexPage(id).catch(...)`.
 */
export function indexPageBackground(pageId: string): void {
  void indexPage(pageId)
    .then(() => console.log(JSON.stringify({ event: "wiki.indexPage.done", pageId })))
    .catch((error) =>
      console.error(
        JSON.stringify({
          event: "wiki.indexPage.error",
          pageId,
          error: error instanceof Error ? error.message : String(error),
        })
      )
    );
}

export async function deletePageEmbeddings(pageId: string): Promise<void> {
  await deletePageEmbeddingsByPageId(pageId);
}

export async function reindexAllPages(): Promise<{ indexed: number; errors: number }> {
  const allPages = await listNonDeletedPageIds();

  let indexed = 0;
  let errors = 0;

  for (const page of allPages) {
    try {
      await indexPage(page.id);
      indexed++;
    } catch (err) {
      console.error(`Failed to index page ${page.id}:`, err);
      errors++;
    }
  }

  return { indexed, errors };
}
