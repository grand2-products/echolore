import { UserRole } from "@echolore/shared/contracts";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  cosineSimilarity,
  embedText,
  getEmbeddingModel,
  isEmbeddingEnabled,
} from "../../ai/embeddings.js";
import { db } from "../../db/index.js";
import {
  blocks,
  type Page,
  pageInheritance,
  pagePermissions,
  pageRevisions,
  pages,
  userGroupMemberships,
} from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import { canReadPage } from "../../policies/authorization-policy.js";
import {
  createRevision,
  getNextRevisionNumber,
  getRevisionById,
} from "../../repositories/wiki/revision-repository.js";
import {
  getPageBlocks,
  getPageById,
  getPageParentId,
  listBlockContentsByPageIds,
  listPagesOrderedByUpdatedAt,
  searchPagesLexically,
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

type WikiWriteTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createPageWithAccessDefaultsTx(
  tx: WikiWriteTx,
  input: {
    id: string;
    title: string;
    spaceId: string;
    parentId: string | null;
    authorId: string;
    createdAt: Date;
    updatedAt: Date;
  }
) {
  const [page] = await tx.insert(pages).values(input).returning();
  if (!page) {
    throw new Error("Failed to create page");
  }

  await tx.insert(pageInheritance).values({
    id: `inherit_${nanoid(12)}`,
    pageId: page.id,
    inheritFromParent: Boolean(page.parentId),
    createdAt: input.createdAt,
  });

  if (!page.parentId) {
    const memberships = await tx
      .select({ groupId: userGroupMemberships.groupId })
      .from(userGroupMemberships)
      .where(eq(userGroupMemberships.userId, input.authorId));

    const uniqueGroupIds = [...new Set(memberships.map((membership) => membership.groupId))];

    if (uniqueGroupIds.length > 0) {
      await tx.insert(pagePermissions).values(
        uniqueGroupIds.map((groupId) => ({
          id: `perm_${nanoid(12)}`,
          pageId: page.id,
          groupId,
          canRead: true,
          canWrite: true,
          canDelete: false,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        }))
      );
    }
  }

  return page;
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
  return db.transaction((tx) => createPageWithAccessDefaultsTx(tx, input));
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

  return db.transaction(async (tx) => {
    const now = new Date();

    // Snapshot current state before restoring (inside transaction)
    const currentBlocks = await tx
      .select()
      .from(blocks)
      .where(eq(blocks.pageId, pageId))
      .orderBy(blocks.sortOrder);
    const revisionNumber = await getNextRevisionNumber(pageId);
    await tx.insert(pageRevisions).values({
      id: `rev_${crypto.randomUUID().slice(0, 12)}`,
      pageId,
      revisionNumber,
      title: page.title,
      blocks: currentBlocks.map((b) => ({
        type: b.type,
        content: b.content,
        properties: b.properties as Record<string, unknown> | null,
        sortOrder: b.sortOrder,
      })),
      authorId: actorUserId,
      createdAt: now,
    });

    // Update page title
    const [updatedPage] = await tx
      .update(pages)
      .set({ title: revision.title, updatedAt: now })
      .where(eq(pages.id, pageId))
      .returning();

    // Delete existing blocks
    await tx.delete(blocks).where(eq(blocks.pageId, pageId));

    // Re-create blocks from revision snapshot
    if (revision.blocks.length > 0) {
      await tx.insert(blocks).values(
        revision.blocks.map((block) => ({
          id: crypto.randomUUID(),
          pageId,
          type: block.type,
          content: block.content,
          properties: block.properties,
          sortOrder: block.sortOrder,
          createdAt: now,
          updatedAt: now,
        }))
      );
    }

    return updatedPage;
  });
}
