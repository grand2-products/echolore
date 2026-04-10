import { UserRole } from "@echolore/shared/contracts";
import { embedText, isEmbeddingEnabled } from "../../ai/embeddings.js";
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
  const queryEmbedding = await embedText(queryText, {
    taskType: "RETRIEVAL_QUERY",
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

export type SearchMode = "vector" | "ilike_fallback" | "ilike_disabled" | "empty_embedding";

export interface VisibleChunksResult {
  results: VectorSearchResult[];
  searchMode: SearchMode;
}

export async function searchVisibleChunks(
  user: SessionUser,
  queryText: string,
  limit = 5
): Promise<VisibleChunksResult> {
  if (!(await isEmbeddingEnabled())) {
    const results = await fallbackIlikeSearch(queryText, limit);
    return { results, searchMode: "ilike_disabled" };
  }

  const queryEmbedding = await embedText(queryText, {
    taskType: "RETRIEVAL_QUERY",
  });

  if (!queryEmbedding) {
    console.warn(
      JSON.stringify({
        event: "vector-search.embed-failed",
        query: queryText.slice(0, 100),
        reason: "embedText returned null despite embedding being enabled",
      })
    );
    return { results: [], searchMode: "empty_embedding" };
  }

  let results: VectorSearchResult[];

  if (user.role === UserRole.Admin) {
    try {
      results = await searchByVectorRepo("", queryEmbedding, limit);
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "vector-search.fallback",
          reason: "vector_query_failed",
          error: err instanceof Error ? err.message : "Unknown",
        })
      );
      return { results: await searchPagesByIlike(queryText, limit), searchMode: "ilike_fallback" };
    }
  } else {
    try {
      results = await searchByVectorForUser(queryEmbedding, user.id, limit);
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "vector-search.fallback",
          reason: "vector_query_failed",
          error: err instanceof Error ? err.message : "Unknown",
        })
      );
      return { results: await searchPagesByIlike(queryText, limit), searchMode: "ilike_fallback" };
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
  return {
    results: results.filter((r) => {
      if (seen.has(r.pageId)) return false;
      seen.add(r.pageId);
      return true;
    }),
    searchMode: "vector",
  };
}

async function fallbackIlikeSearch(
  queryText: string,
  limit: number
): Promise<VectorSearchResult[]> {
  return searchPagesByIlike(queryText, limit);
}
