import { UserRole } from "@echolore/shared/contracts";
import { nanoid } from "nanoid";
import { defaultEmbeddingProvider, type EmbeddingProvider } from "../../ai/providers/index.js";
import type { Page } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import { stripHtml } from "../../lib/html-utils.js";
import { canReadPage } from "../../policies/authorization-policy.js";
import {
  createRevision,
  getLatestRevisionByPageId,
  getNextRevisionNumber,
  getRevisionById,
} from "../../repositories/wiki/revision-repository.js";
import {
  createPageWithAccessDefaults as createPageWithAccessDefaultsRepo,
  findPagesWithExplicitDeny,
  getPageBlocks,
  getPageById,
  getPageParentId,
  listBlockContentsByPageIds,
  listPagesByIds,
  listPagesOrderedByUpdatedAt,
  restorePageRevision as restorePageRevisionRepo,
  searchByVectorForUser,
  searchPagesLexically,
  type VectorSearchResult,
} from "../../repositories/wiki/wiki-repository.js";

export type { NewBlock } from "../../db/schema.js";
export {
  getRevisionById,
  listRevisionsByPageId,
} from "../../repositories/wiki/revision-repository.js";
// Re-export repository CRUD for route layer access
export {
  createBlock,
  deleteBlock,
  getBlockById,
  getPageBlocks,
  getPageById,
  listDeletedPages,
  movePageAcrossSpaces,
  permanentDeletePage,
  reorderPages,
  restorePage,
  softDeletePage,
  updateBlock,
  updatePage,
} from "../../repositories/wiki/wiki-repository.js";

// Replaceable for testing
let embedding: EmbeddingProvider = defaultEmbeddingProvider;

/** @internal Override embedding provider (test-only) */
export function _setEmbeddingProvider(p: EmbeddingProvider) {
  embedding = p;
}

const VECTOR_SEARCH_LIMIT = 50;
const SNIPPET_MAX_LENGTH = 120;
// Weights for hybrid scoring. Vector similarity dominates since it captures
// semantics (typos, synonyms, concept matches), while lexical rank breaks ties
// and gives a small boost to exact-keyword matches.
const VECTOR_WEIGHT = 0.75;
const LEXICAL_WEIGHT = 0.25;

function extractSnippet(text: string, queryLower: string): string {
  if (!text) return "";

  const idx = text.toLowerCase().indexOf(queryLower);
  if (idx === -1) {
    // No match in content — return beginning of text
    return text.length > SNIPPET_MAX_LENGTH ? `${text.slice(0, SNIPPET_MAX_LENGTH)}...` : text;
  }

  // Show context around the match
  const contextBefore = 30;
  const start = Math.max(0, idx - contextBefore);
  const end = Math.min(text.length, start + SNIPPET_MAX_LENGTH);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = `...${snippet}`;
  if (end < text.length) snippet = `${snippet}...`;
  return snippet;
}

export async function filterReadablePages(user: SessionUser, items: Page[]): Promise<Page[]> {
  if (user.role === UserRole.Admin) {
    return items;
  }

  const readablePages = await Promise.all(
    items.map(async (page) => ((await canReadPage(user, page.id, page.authorId)) ? page : null))
  );

  return readablePages.filter((page): page is Page => Boolean(page));
}

export async function listVisiblePages(user: SessionUser): Promise<Page[]> {
  const allPages = await listPagesOrderedByUpdatedAt();
  return filterReadablePages(user, allPages);
}

export async function detectPageCycle(pageId: string, newParentId: string): Promise<boolean> {
  if (pageId === newParentId) return true;

  let currentId: string | null = newParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === pageId) return true;
    if (visited.has(currentId)) break;
    visited.add(currentId);

    currentId = await getPageParentId(currentId);
  }

  return false;
}

/**
 * Hybrid wiki page search.
 *
 * Runs lexical (FTS + ILIKE) and pgvector searches in parallel, unions the
 * results, enforces read permissions, then reranks with a hybrid score.
 * Uses the pre-computed `page_embeddings` rows via `searchByVectorForUser`
 * — no ad-hoc re-embedding at query time.
 *
 * Falls back to lexical-only when:
 * - `semantic=false` (caller opted out)
 * - the embedding provider is unavailable or returns null
 * - the vector query fails (e.g. dimension mismatch during reindex)
 */
export async function searchVisiblePages(
  user: SessionUser,
  query: string,
  semantic: boolean
): Promise<{
  pages: Page[];
  snippets: Record<string, string>;
  searchMeta: { mode: "lexical" | "hybrid"; semanticApplied: boolean; model?: string };
}> {
  const lexicalPromise = searchPagesLexically(query);

  // Compute query embedding + run vector search (best-effort; null-safe)
  let queryEmbedding: number[] | null = null;
  let vectorResults: VectorSearchResult[] = [];
  if (semantic && (await embedding.isAvailable())) {
    queryEmbedding = await embedding.embed(query, { taskType: "RETRIEVAL_QUERY" });
    if (queryEmbedding) {
      try {
        vectorResults = await searchByVectorForUser(queryEmbedding, user.id, VECTOR_SEARCH_LIMIT);
        // Space-level perms are enforced in SQL; layer page-level explicit denies.
        if (vectorResults.length > 0) {
          const vectorPageIds = [...new Set(vectorResults.map((r) => r.pageId))];
          const denied = await findPagesWithExplicitDeny(vectorPageIds, user.id);
          if (denied.size > 0) {
            vectorResults = vectorResults.filter((r) => !denied.has(r.pageId));
          }
        }
      } catch (error) {
        console.warn("Vector search failed; falling back to lexical only", error);
        vectorResults = [];
        queryEmbedding = null;
      }
    }
  }

  const lexicalPages = await lexicalPromise;

  // Union both result sets on pageId, hydrating full Page rows for vector-only hits.
  const pageMap = new Map<string, Page>();
  for (const p of lexicalPages) pageMap.set(p.id, p);

  const vectorOnlyIds = vectorResults.filter((r) => !pageMap.has(r.pageId)).map((r) => r.pageId);
  if (vectorOnlyIds.length > 0) {
    const extraPages = await listPagesByIds(vectorOnlyIds);
    for (const p of extraPages) pageMap.set(p.id, p);
  }

  // Page-level visibility filter (covers both lexical and vector results).
  const visiblePages = await filterReadablePages(user, Array.from(pageMap.values()));

  // Build snippets from block content.
  const allPageIds = visiblePages.map((p) => p.id);
  const allBlocks = allPageIds.length > 0 ? await listBlockContentsByPageIds(allPageIds) : [];
  const blockMap = new Map<string, string[]>();
  for (const block of allBlocks) {
    const items = blockMap.get(block.pageId) ?? [];
    if (block.content) items.push(stripHtml(block.content));
    blockMap.set(block.pageId, items);
  }
  const queryLower = query.toLowerCase();
  const snippets: Record<string, string> = {};
  for (const page of visiblePages) {
    const fullText = (blockMap.get(page.id) ?? []).join(" ");
    snippets[page.id] = extractSnippet(fullText, queryLower);
  }

  // Nothing semantic to apply — return lexical order.
  if (!queryEmbedding || vectorResults.length === 0) {
    return {
      pages: visiblePages,
      snippets,
      searchMeta: { mode: "lexical", semanticApplied: false },
    };
  }

  // Hybrid rerank. Lexical rank is a 0..1 score based on position in the
  // lexical result list (higher = earlier). Vector similarity is already 0..1.
  // Pages present in only one set get 0 for the missing dimension.
  const lexicalRank = new Map<string, number>();
  const lexicalTotal = Math.max(lexicalPages.length, 1);
  lexicalPages.forEach((p, idx) => {
    lexicalRank.set(p.id, (lexicalPages.length - idx) / lexicalTotal);
  });
  const vectorScore = new Map<string, number>();
  for (const r of vectorResults) vectorScore.set(r.pageId, r.similarity);

  const scored = visiblePages.map((page) => ({
    page,
    score:
      VECTOR_WEIGHT * (vectorScore.get(page.id) ?? 0) +
      LEXICAL_WEIGHT * (lexicalRank.get(page.id) ?? 0),
  }));
  scored.sort((a, b) => b.score - a.score);

  return {
    pages: scored.map((s) => s.page),
    snippets,
    searchMeta: {
      mode: "hybrid",
      semanticApplied: true,
      model: await embedding.getModel(),
    },
  };
}

export async function createPageWithAccessDefaults(input: {
  id: string;
  title: string;
  spaceId: string;
  parentId: string | null;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return createPageWithAccessDefaultsRepo(input);
}

export async function createPageRevision(pageId: string, authorId: string) {
  const page = await getPageById(pageId);
  if (!page) {
    throw new Error(`Page not found: ${pageId}`);
  }

  const pageBlocks = await getPageBlocks(pageId);

  const blocksSnapshot = pageBlocks.map((block) => ({
    type: block.type,
    content: block.content,
    properties: block.properties as Record<string, unknown> | null,
    sortOrder: block.sortOrder,
  }));

  return createPageRevisionWithDedup({
    pageId,
    authorId,
    title: page.title,
    blocks: blocksSnapshot,
  });
}

interface RevisionDraft {
  pageId: string;
  authorId: string;
  title: string;
  blocks: Array<{
    type: string;
    content: string | null;
    properties: Record<string, unknown> | null;
    sortOrder: number;
  }>;
}

/**
 * Insert a new revision unless the most recent revision is structurally
 * identical (same title and blocks). Returns the existing latest revision in
 * that case so callers always get a revision object back.
 *
 * Concurrent callers may race past the dedup check and both attempt to insert
 * the same revisionNumber. On UNIQUE constraint violation we re-check dedup
 * and retry with a freshly computed revisionNumber.
 */
async function createPageRevisionWithDedup(draft: RevisionDraft, maxAttempts = 3) {
  const draftDigest = stableSerializeBlockSnapshot(draft.blocks);

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const latest = await getLatestRevisionByPageId(draft.pageId);
    if (
      latest &&
      latest.title === draft.title &&
      stableSerializeBlockSnapshot(latest.blocks) === draftDigest
    ) {
      return latest;
    }

    const revisionNumber = await getNextRevisionNumber(draft.pageId);
    try {
      return await createRevision({
        id: `rev_${nanoid(12)}`,
        pageId: draft.pageId,
        revisionNumber,
        title: draft.title,
        blocks: draft.blocks,
        authorId: draft.authorId,
        createdAt: new Date(),
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      // Another caller inserted the same revisionNumber concurrently. Loop:
      // the next dedup check may now match the just-inserted revision, or we
      // recompute a fresh number.
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("createPageRevisionWithDedup: exhausted retries");
}

/**
 * Detect Postgres unique-constraint violations (SQLSTATE 23505). Used to
 * recover from races in revisionNumber assignment between concurrent
 * createPageRevision calls.
 */
function isUniqueConstraintError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
}

/**
 * Deterministically serialize a block snapshot (the shape stored in
 * page_revisions.blocks) with sorted object keys. Used to compare two
 * revisions for structural equality. Not a general-purpose stable stringify —
 * does not handle Date, undefined, Buffer, or other non-JSON values; safe
 * only because BlockJson contains only JSON-serializable primitives.
 */
function stableSerializeBlockSnapshot(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerializeBlockSnapshot).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerializeBlockSnapshot(obj[k])}`).join(",")}}`;
}

export async function restoreRevision(pageId: string, revisionId: string, actorUserId: string) {
  const page = await getPageById(pageId);
  if (!page) {
    throw new Error(`Page not found: ${pageId}`);
  }

  const revision = await getRevisionById(revisionId);
  if (!revision) {
    throw new Error(`Revision not found: ${revisionId}`);
  }
  if (revision.pageId !== pageId) {
    throw new Error("Revision does not belong to this page");
  }

  const currentBlocks = await getPageBlocks(pageId);
  const revisionNumber = await getNextRevisionNumber(pageId);

  return restorePageRevisionRepo({
    pageId,
    revision: {
      pageId: revision.pageId,
      title: revision.title,
      blocks: revision.blocks,
    },
    currentTitle: page.title,
    currentBlocks: currentBlocks.map((b) => ({
      type: b.type,
      content: b.content,
      properties: b.properties,
      sortOrder: b.sortOrder,
    })),
    revisionNumber,
    actorUserId,
  });
}
