import { UserRole } from "@echolore/shared/contracts";
import { sql } from "drizzle-orm";
import { embedText, isEmbeddingEnabled } from "../../ai/embeddings.js";
import { db } from "../../db/index.js";
import type { SessionUser } from "../../lib/auth.js";
import { canReadPage } from "../../policies/authorization-policy.js";

const EMBEDDING_DIMENSIONS = 768;

export interface VectorSearchResult {
  pageId: string;
  pageTitle: string;
  chunkText: string;
  similarity: number;
}

/**
 * Search page embeddings by vector similarity.
 */
export async function searchByVector(queryText: string, limit = 10): Promise<VectorSearchResult[]> {
  const queryEmbedding = await embedText(queryText, {
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: EMBEDDING_DIMENSIONS,
  });

  if (!queryEmbedding) return [];

  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const results = await db.execute(sql`
    SELECT
      pe.page_id,
      p.title AS page_title,
      pe.plain_text AS chunk_text,
      1 - (pe.embedding <=> ${vectorStr}::vector) AS similarity
    FROM page_embeddings pe
    JOIN pages p ON p.id = pe.page_id
    WHERE p.deleted_at IS NULL
    ORDER BY pe.embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `);

  return (
    results.rows as Array<{
      page_id: string;
      page_title: string;
      chunk_text: string;
      similarity: number;
    }>
  ).map((row) => ({
    pageId: row.page_id,
    pageTitle: row.page_title,
    chunkText: row.chunk_text,
    similarity: Number(row.similarity),
  }));
}

/**
 * Search with permission filtering and page-level deduplication.
 */
export async function searchVisibleChunks(
  user: SessionUser,
  queryText: string,
  limit = 5
): Promise<VectorSearchResult[]> {
  if (!(await isEmbeddingEnabled())) {
    return fallbackIlikeSearch(queryText, limit);
  }

  // Fetch more results to allow for permission filtering
  const rawResults = await searchByVector(queryText, limit * 3);

  const visible: VectorSearchResult[] = [];
  const seenPageIds = new Set<string>();

  for (const result of rawResults) {
    if (seenPageIds.has(result.pageId)) continue;

    // Admin can read all pages; for others, pass "" as ownerUserId
    // so evaluatePageAccess skips the owner check and falls through
    // to group/space permission evaluation.
    if (user.role === UserRole.Admin) {
      seenPageIds.add(result.pageId);
      visible.push(result);
    } else {
      const canRead = await canReadPage(user, result.pageId, "");
      if (canRead) {
        seenPageIds.add(result.pageId);
        visible.push(result);
      }
    }

    if (visible.length >= limit) break;
  }

  return visible;
}

/**
 * Fallback ILIKE-based search when embeddings are not available.
 */
async function fallbackIlikeSearch(
  queryText: string,
  limit: number
): Promise<VectorSearchResult[]> {
  // Escape LIKE special characters to prevent unintended pattern matching
  const escaped = queryText.replace(/[%_\\]/g, (ch) => `\\${ch}`);
  const pattern = `%${escaped}%`;

  const results = await db.execute(sql`
    SELECT DISTINCT p.id AS page_id, p.title AS page_title,
      COALESCE(
        (SELECT b.content FROM blocks b WHERE b.page_id = p.id AND b.content ILIKE ${pattern} LIMIT 1),
        p.title
      ) AS chunk_text,
      0.5 AS similarity
    FROM pages p
    LEFT JOIN blocks b ON b.page_id = p.id
    WHERE p.deleted_at IS NULL
      AND (p.title ILIKE ${pattern} OR b.content ILIKE ${pattern})
    ORDER BY p.title
    LIMIT ${limit}
  `);

  return (
    results.rows as Array<{
      page_id: string;
      page_title: string;
      chunk_text: string;
      similarity: number;
    }>
  ).map((row) => ({
    pageId: row.page_id,
    pageTitle: row.page_title,
    chunkText: row.chunk_text || "",
    similarity: Number(row.similarity),
  }));
}
