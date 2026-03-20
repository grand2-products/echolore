import { UserRole } from "@echolore/shared/contracts";
import { nanoid } from "nanoid";
import {
  cosineSimilarity,
  embedText,
  getEmbeddingModel,
  isEmbeddingEnabled,
} from "../../ai/embeddings.js";
import type { Page } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import { canReadPage } from "../../policies/authorization-policy.js";
import {
  createRevision,
  getNextRevisionNumber,
  getRevisionById,
} from "../../repositories/wiki/revision-repository.js";
import {
  createPageWithAccessDefaults as createPageWithAccessDefaultsRepo,
  getPageBlocks,
  getPageById,
  getPageParentId,
  listBlockContentsByPageIds,
  listPagesOrderedByUpdatedAt,
  restorePageRevision as restorePageRevisionRepo,
  searchPagesLexically,
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
  permanentDeletePage,
  restorePage,
  softDeletePage,
  updateBlock,
  updatePage,
} from "../../repositories/wiki/wiki-repository.js";

const SEMANTIC_RERANK_LIMIT = 20;

function buildPageSearchText(title: string, blockContents: string[]) {
  const joinedBlocks = blockContents.filter(Boolean).join("\n");
  return `${title}\n${joinedBlocks}`.trim().slice(0, 8000);
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

export async function searchVisiblePages(
  user: SessionUser,
  query: string,
  semantic: boolean
): Promise<{
  pages: Page[];
  searchMeta: { mode: "lexical" | "hybrid"; semanticApplied: boolean; model?: string };
}> {
  const matchedPages = await searchPagesLexically(query);
  const visiblePages = await filterReadablePages(user, matchedPages);

  if (!semantic || !(await isEmbeddingEnabled()) || visiblePages.length === 0) {
    return {
      pages: visiblePages,
      searchMeta: { mode: "lexical", semanticApplied: false },
    };
  }

  try {
    const queryEmbedding = await embedText(query, { taskType: "RETRIEVAL_QUERY" });
    if (!queryEmbedding) {
      return {
        pages: visiblePages,
        searchMeta: { mode: "lexical", semanticApplied: false },
      };
    }

    const rerankCandidates = visiblePages.slice(0, SEMANTIC_RERANK_LIMIT);
    const pageIds = rerankCandidates.map((page) => page.id);
    const pageBlocks = await listBlockContentsByPageIds(pageIds);

    const blockMap = new Map<string, string[]>();
    for (const block of pageBlocks) {
      const items = blockMap.get(block.pageId) ?? [];
      if (block.content) items.push(block.content);
      blockMap.set(block.pageId, items);
    }

    const lexicalRank = new Map<string, number>();
    rerankCandidates.forEach((page, index) => {
      lexicalRank.set(page.id, (rerankCandidates.length - index) / rerankCandidates.length);
    });

    const scored = await Promise.all(
      rerankCandidates.map(async (page) => {
        const text = buildPageSearchText(page.title, blockMap.get(page.id) ?? []);
        const pageEmbedding = await embedText(text, { taskType: "RETRIEVAL_DOCUMENT" });
        const semanticScore = pageEmbedding ? cosineSimilarity(queryEmbedding, pageEmbedding) : 0;
        const lexicalScore = lexicalRank.get(page.id) ?? 0;
        return { page, score: semanticScore * 0.75 + lexicalScore * 0.25 };
      })
    );

    scored.sort((a, b) => b.score - a.score);

    return {
      pages: [...scored.map((entry) => entry.page), ...visiblePages.slice(SEMANTIC_RERANK_LIMIT)],
      searchMeta: {
        mode: "hybrid",
        semanticApplied: true,
        model: await getEmbeddingModel(),
      },
    };
  } catch (error) {
    console.error("Semantic rerank failed; fallback to lexical", error);
    return {
      pages: visiblePages,
      searchMeta: { mode: "lexical", semanticApplied: false },
    };
  }
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
  const revisionNumber = await getNextRevisionNumber(pageId);

  const blocksSnapshot = pageBlocks.map((block) => ({
    type: block.type,
    content: block.content,
    properties: block.properties as Record<string, unknown> | null,
    sortOrder: block.sortOrder,
  }));

  return createRevision({
    id: `rev_${nanoid(12)}`,
    pageId,
    revisionNumber,
    title: page.title,
    blocks: blocksSnapshot,
    authorId,
    createdAt: new Date(),
  });
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
    revision,
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
