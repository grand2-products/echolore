import { UserRole } from "@echolore/shared/contracts";
import { nanoid } from "nanoid";
import { defaultEmbeddingProvider, type EmbeddingProvider } from "../../ai/providers/index.js";
import type { Page } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import { stripHtml } from "../../lib/html-utils.js";
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

// Replaceable for testing
let embedding: EmbeddingProvider = defaultEmbeddingProvider;

/** @internal Override embedding provider (test-only) */
export function _setEmbeddingProvider(p: EmbeddingProvider) {
  embedding = p;
}

const SEMANTIC_RERANK_LIMIT = 20;
const SNIPPET_MAX_LENGTH = 120;

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

function buildPageSearchText(title: string, blockContents: string[]) {
  const joinedBlocks = blockContents.filter(Boolean).join("\n");
  return `${title}\n${joinedBlocks}`.trim().slice(0, 8000);
}

export async function filterReadablePages(user: SessionUser, items: Page[]): Promise<Page[]> {
  if (user.role === UserRole.Admin) {
    return items;
  }

  const readablePages = await Promise.all(
    items.map(async (page) => ((await canReadPage(user, page.id, page.author_id)) ? page : null))
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
  snippets: Record<string, string>;
  searchMeta: { mode: "lexical" | "hybrid"; semanticApplied: boolean; model?: string };
}> {
  const matchedPages = await searchPagesLexically(query);
  const visiblePages = await filterReadablePages(user, matchedPages);

  // Fetch block content once — shared by snippet generation and semantic reranking
  const allPageIds = visiblePages.map((p) => p.id);
  const allBlocks = allPageIds.length > 0 ? await listBlockContentsByPageIds(allPageIds) : [];

  const blockMap = new Map<string, string[]>();
  for (const block of allBlocks) {
    const items = blockMap.get(block.page_id) ?? [];
    if (block.content) items.push(stripHtml(block.content));
    blockMap.set(block.page_id, items);
  }

  // Build snippets from the shared block map
  const queryLower = query.toLowerCase();
  const snippets: Record<string, string> = {};
  for (const page of visiblePages) {
    const fullText = (blockMap.get(page.id) ?? []).join(" ");
    snippets[page.id] = extractSnippet(fullText, queryLower);
  }

  if (!semantic || !(await embedding.isAvailable()) || visiblePages.length === 0) {
    return {
      pages: visiblePages,
      snippets,
      searchMeta: { mode: "lexical", semanticApplied: false },
    };
  }

  try {
    const queryEmbedding = await embedding.embed(query, { taskType: "RETRIEVAL_QUERY" });
    if (!queryEmbedding) {
      return {
        pages: visiblePages,
        snippets,
        searchMeta: { mode: "lexical", semanticApplied: false },
      };
    }

    const rerankCandidates = visiblePages.slice(0, SEMANTIC_RERANK_LIMIT);

    const lexicalRank = new Map<string, number>();
    rerankCandidates.forEach((page, index) => {
      lexicalRank.set(page.id, (rerankCandidates.length - index) / rerankCandidates.length);
    });

    const scored = await Promise.all(
      rerankCandidates.map(async (page) => {
        const text = buildPageSearchText(page.title, blockMap.get(page.id) ?? []);
        const pageEmbedding = await embedding.embed(text, { taskType: "RETRIEVAL_DOCUMENT" });
        const semanticScore = pageEmbedding
          ? embedding.cosineSimilarity(queryEmbedding, pageEmbedding)
          : 0;
        const lexicalScore = lexicalRank.get(page.id) ?? 0;
        return { page, score: semanticScore * 0.75 + lexicalScore * 0.25 };
      })
    );

    scored.sort((a, b) => b.score - a.score);

    return {
      pages: [...scored.map((entry) => entry.page), ...visiblePages.slice(SEMANTIC_RERANK_LIMIT)],
      snippets,
      searchMeta: {
        mode: "hybrid",
        semanticApplied: true,
        model: await embedding.getModel(),
      },
    };
  } catch (error) {
    console.error("Semantic rerank failed; fallback to lexical", error);
    return {
      pages: visiblePages,
      snippets,
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
    sortOrder: block.sort_order,
  }));

  return createRevision({
    id: `rev_${nanoid(12)}`,
    page_id: pageId,
    revision_number: revisionNumber,
    title: page.title,
    blocks: blocksSnapshot,
    author_id: authorId,
    created_at: new Date(),
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
  if (revision.page_id !== pageId) {
    throw new Error("Revision does not belong to this page");
  }

  const currentBlocks = await getPageBlocks(pageId);
  const revisionNumber = await getNextRevisionNumber(pageId);

  return restorePageRevisionRepo({
    pageId,
    revision: {
      pageId: revision.page_id,
      title: revision.title,
      blocks: revision.blocks,
    },
    currentTitle: page.title,
    currentBlocks: currentBlocks.map((b) => ({
      type: b.type,
      content: b.content,
      properties: b.properties,
      sortOrder: b.sort_order,
    })),
    revisionNumber,
    actorUserId,
  });
}
