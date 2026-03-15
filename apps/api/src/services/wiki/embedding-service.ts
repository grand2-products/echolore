import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { embedText, getEmbeddingModel, isEmbeddingEnabled } from "../../ai/embeddings.js";
import { db } from "../../db/index.js";
import { pageEmbeddings, pages } from "../../db/schema.js";
import { stripHtml } from "../../lib/html-utils.js";
import { getPageBlocks, getPageById } from "../../repositories/wiki/wiki-repository.js";

const EMBEDDING_DIMENSIONS = 768;
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

/**
 * Index a page: extract text, chunk, embed, and upsert into page_embeddings.
 */
export async function indexPage(pageId: string): Promise<void> {
  if (!(await isEmbeddingEnabled())) return;

  const plainText = await extractPagePlainText(pageId);
  if (!plainText) {
    await deletePageEmbeddings(pageId);
    return;
  }

  const chunks = chunkText(plainText);
  const modelId = await getEmbeddingModel();
  const now = new Date();

  // Embed all chunks
  const embeddings: { chunkIndex: number; text: string; vector: number[] }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkText_ = chunks[i]!;
    const vector = await embedText(chunkText_, {
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: EMBEDDING_DIMENSIONS,
    });
    if (vector) {
      embeddings.push({ chunkIndex: i, text: chunkText_, vector });
    }
  }

  if (embeddings.length === 0) return;

  await db.transaction(async (tx) => {
    // Delete existing embeddings for this page
    await tx.delete(pageEmbeddings).where(eq(pageEmbeddings.pageId, pageId));

    // Insert new embeddings
    await tx.insert(pageEmbeddings).values(
      embeddings.map((e) => ({
        id: `emb_${nanoid(12)}`,
        pageId,
        chunkIndex: e.chunkIndex,
        plainText: e.text,
        embedding: e.vector,
        modelId,
        createdAt: now,
        updatedAt: now,
      }))
    );
  });
}

/**
 * Delete all embeddings for a page.
 */
export async function deletePageEmbeddings(pageId: string): Promise<void> {
  await db.delete(pageEmbeddings).where(eq(pageEmbeddings.pageId, pageId));
}

/**
 * Reindex all non-deleted pages. For admin use.
 */
export async function reindexAllPages(): Promise<{ indexed: number; errors: number }> {
  const allPages = await db
    .select({ id: pages.id })
    .from(pages)
    .where(sql`${pages.deletedAt} IS NULL`);

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
