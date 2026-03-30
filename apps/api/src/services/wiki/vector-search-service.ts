import { UserRole } from "@echolore/shared/contracts";
import { embedText, getEmbeddingDimensions, isEmbeddingEnabled } from "../../ai/embeddings.js";
import type { SessionUser } from "../../lib/auth.js";
import {
  findPagesWithExplicitDeny,
  searchByVectorForUser,
  searchByVector as searchByVectorRepo,
  searchPagesByIlike,
  type VectorSearchResult,
} from "../../repositories/wiki/wiki-repository.js";

export type { VectorSearchResult };

export async function searchByVector(queryText: string, limit = 10): Promise<VectorSearchResult[]> {
  const dimensions = await getEmbeddingDimensions();
  const queryEmbedding = await embedText(queryText, {
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: dimensions,
  });

  if (!queryEmbedding) return [];

  try {
    return await searchByVectorRepo(queryText, queryEmbedding, limit);
  } catch (err) {
    // pgvector throws when query dimensions don't match stored dimensions
    // (e.g. after a dimension change before re-indexing completes)
    console.warn("Vector search failed, falling back to keyword search:", err);
    return searchPagesByIlike(queryText, limit);
  }
}

export async function searchVisibleChunks(
  user: SessionUser,
  queryText: string,
  limit = 5
): Promise<VectorSearchResult[]> {
  if (!(await isEmbeddingEnabled())) {
    return fallbackIlikeSearch(queryText, limit);
  }

  const dimensions = await getEmbeddingDimensions();
  const queryEmbedding = await embedText(queryText, {
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: dimensions,
  });

  if (!queryEmbedding) return [];

  let results: VectorSearchResult[];

  if (user.role === UserRole.Admin) {
    // Admin: no permission filter needed
    try {
      results = await searchByVectorRepo("", queryEmbedding, limit);
    } catch (err) {
      console.warn("Vector search failed, falling back to keyword search:", err);
      return searchPagesByIlike(queryText, limit);
    }
  } else {
    // Non-admin: space-level permission filter in SQL
    try {
      results = await searchByVectorForUser(queryEmbedding, user.id, limit);
    } catch (err) {
      console.warn("Vector search failed, falling back to keyword search:", err);
      return searchPagesByIlike(queryText, limit);
    }

    // Post-filter: exclude pages with explicit page-level deny
    if (results.length > 0) {
      const pageIds = [...new Set(results.map((r) => r.pageId))];
      const denied = await findPagesWithExplicitDeny(pageIds, user.id);
      if (denied.size > 0) {
        results = results.filter((r) => !denied.has(r.pageId));
      }
    }
  }

  // Deduplicate by pageId, keep highest similarity
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.pageId)) return false;
    seen.add(r.pageId);
    return true;
  });
}

async function fallbackIlikeSearch(
  queryText: string,
  limit: number
): Promise<VectorSearchResult[]> {
  return searchPagesByIlike(queryText, limit);
}
