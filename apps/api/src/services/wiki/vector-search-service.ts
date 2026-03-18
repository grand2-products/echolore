import { UserRole } from "@echolore/shared/contracts";
import { embedText, getEmbeddingDimensions, isEmbeddingEnabled } from "../../ai/embeddings.js";
import type { SessionUser } from "../../lib/auth.js";
import { canReadPage } from "../../policies/authorization-policy.js";
import {
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

  const rawResults = await searchByVector(queryText, limit * 3);

  const visible: VectorSearchResult[] = [];
  const seenPageIds = new Set<string>();

  for (const result of rawResults) {
    if (seenPageIds.has(result.pageId)) continue;

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

async function fallbackIlikeSearch(
  queryText: string,
  limit: number
): Promise<VectorSearchResult[]> {
  return searchPagesByIlike(queryText, limit);
}
