import { and, desc, eq, exists, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import {
  blocks,
  type NewBlock,
  type NewPage,
  pageEmbeddings,
  pageInheritance,
  pagePermissions,
  pageRevisions,
  pages,
  spaces,
  userGroupMemberships,
  users,
} from "../../db/schema.js";
import { escapeLikePattern, firstOrNull, getRecordById } from "../../lib/db-utils.js";

export type WikiWriteTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function listPagesOrderedByUpdatedAt() {
  const rows = await db
    .select({
      id: pages.id,
      title: pages.title,
      spaceId: pages.spaceId,
      parentId: pages.parentId,
      authorId: pages.authorId,
      deletedAt: pages.deletedAt,
      createdAt: pages.createdAt,
      updatedAt: pages.updatedAt,
      authorName: users.name,
      spaceName: spaces.name,
    })
    .from(pages)
    .leftJoin(users, eq(pages.authorId, users.id))
    .leftJoin(spaces, eq(pages.spaceId, spaces.id))
    .where(isNull(pages.deletedAt))
    .orderBy(desc(pages.updatedAt));

  return rows.map((r) => ({
    ...r,
    authorName: r.authorName ?? undefined,
    spaceName: r.spaceName ?? undefined,
  }));
}

export async function getPageById(id: string) {
  return getRecordById(pages, id);
}

export async function getPageParentId(id: string) {
  const [page] = await db.select({ parentId: pages.parentId }).from(pages).where(eq(pages.id, id));
  return page?.parentId ?? null;
}

export async function getPageBlocks(pageId: string) {
  return db.select().from(blocks).where(eq(blocks.pageId, pageId)).orderBy(blocks.sortOrder);
}

export async function searchPagesLexically(query: string) {
  const titleMatch = sql<boolean>`to_tsvector('simple', coalesce(${pages.title}, '')) @@ plainto_tsquery('simple', ${query})`;
  const blockMatch = exists(
    db
      .select({ id: blocks.id })
      .from(blocks)
      .where(
        and(
          eq(blocks.pageId, pages.id),
          sql<boolean>`to_tsvector('simple', coalesce(${blocks.content}, '')) @@ plainto_tsquery('simple', ${query})`
        )
      )
  );

  return db
    .select()
    .from(pages)
    .where(
      and(
        isNull(pages.deletedAt),
        or(
          titleMatch,
          blockMatch,
          sql<boolean>`coalesce(${pages.title}, '') ilike ${`%${escapeLikePattern(query)}%`}`
        )
      )
    )
    .orderBy(desc(pages.updatedAt));
}

export async function listBlockContentsByPageIds(pageIds: string[]) {
  if (pageIds.length === 0) {
    return [];
  }

  return db
    .select({ pageId: blocks.pageId, content: blocks.content })
    .from(blocks)
    .where(inArray(blocks.pageId, pageIds));
}

export async function createPage(newPage: NewPage) {
  return firstOrNull(await db.insert(pages).values(newPage).returning());
}

export async function updatePage(
  id: string,
  updatePayload: { title?: string; parentId?: string | null; updatedAt: Date }
) {
  return firstOrNull(await db.update(pages).set(updatePayload).where(eq(pages.id, id)).returning());
}

export async function deletePage(id: string) {
  await db.delete(pages).where(eq(pages.id, id));
}

export async function getBlockById(id: string) {
  return getRecordById(blocks, id);
}

export async function createBlock(newBlock: NewBlock) {
  return firstOrNull(await db.insert(blocks).values(newBlock).returning());
}

export async function updateBlock(
  id: string,
  updatePayload: {
    type?: string;
    content?: string | null;
    properties?: Record<string, unknown> | null;
    sortOrder?: number;
    updatedAt: Date;
  }
) {
  return firstOrNull(
    await db.update(blocks).set(updatePayload).where(eq(blocks.id, id)).returning()
  );
}

export async function deleteBlock(id: string) {
  await db.delete(blocks).where(eq(blocks.id, id));
}

export async function softDeletePage(id: string) {
  return firstOrNull(
    await db.update(pages).set({ deletedAt: new Date() }).where(eq(pages.id, id)).returning()
  );
}

export async function restorePage(id: string) {
  return firstOrNull(
    await db.update(pages).set({ deletedAt: null }).where(eq(pages.id, id)).returning()
  );
}

export async function listDeletedPages() {
  return db.select().from(pages).where(isNotNull(pages.deletedAt)).orderBy(desc(pages.deletedAt));
}

export async function permanentDeletePage(id: string) {
  await db.delete(pages).where(eq(pages.id, id));
}

export async function listNonDeletedPageIds(): Promise<{ id: string }[]> {
  return db.select({ id: pages.id }).from(pages).where(isNull(pages.deletedAt));
}

export async function deletePageEmbeddingsByPageId(pageId: string): Promise<void> {
  await db.delete(pageEmbeddings).where(eq(pageEmbeddings.pageId, pageId));
}

export async function replacePageEmbeddings(
  pageId: string,
  embeddings: Array<{
    chunkIndex: number;
    plainText: string;
    embedding: number[];
    modelId: string;
    createdAt: Date;
    updatedAt: Date;
  }>
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(pageEmbeddings).where(eq(pageEmbeddings.pageId, pageId));
    if (embeddings.length > 0) {
      await tx.insert(pageEmbeddings).values(
        embeddings.map((e) => ({
          id: `emb_${nanoid(12)}`,
          pageId,
          chunkIndex: e.chunkIndex,
          plainText: e.plainText,
          embedding: e.embedding,
          modelId: e.modelId,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        }))
      );
    }
  });
}

export async function listUserGroupIdsByUserId(userId: string): Promise<string[]> {
  const memberships = await db
    .select({ groupId: userGroupMemberships.groupId })
    .from(userGroupMemberships)
    .where(eq(userGroupMemberships.userId, userId));
  return [...new Set(memberships.map((m) => m.groupId))];
}

export async function createPageWithAccessDefaults(input: {
  id: string;
  title: string;
  spaceId: string;
  parentId: string | null;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}): Promise<{
  id: string;
  title: string;
  spaceId: string;
  parentId: string | null;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}> {
  return db.transaction(async (tx) => {
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

      const uniqueGroupIds = [...new Set(memberships.map((m) => m.groupId))];

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
  });
}

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
): Promise<{
  id: string;
  title: string;
  spaceId: string;
  parentId: string | null;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}> {
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

    const uniqueGroupIds = [...new Set(memberships.map((m) => m.groupId))];

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

export type PageRevisionBlock = {
  type: string;
  content: string | null;
  properties: Record<string, unknown> | null;
  sortOrder: number;
};

export async function restorePageRevision(input: {
  pageId: string;
  revision: { pageId: string; title: string; blocks: PageRevisionBlock[] };
  currentTitle: string;
  currentBlocks: Array<{
    type: string;
    content: string | null;
    properties: unknown;
    sortOrder: number;
  }>;
  revisionNumber: number;
  actorUserId: string;
}): Promise<{ id: string; title: string; updatedAt: Date } | null> {
  const now = new Date();

  return db.transaction(async (tx) => {
    await tx.insert(pageRevisions).values({
      id: `rev_${crypto.randomUUID().slice(0, 12)}`,
      pageId: input.pageId,
      revisionNumber: input.revisionNumber,
      title: input.currentTitle,
      blocks: input.currentBlocks.map((b) => ({
        type: b.type,
        content: b.content,
        properties: b.properties as Record<string, unknown> | null,
        sortOrder: b.sortOrder,
      })),
      authorId: input.actorUserId,
      createdAt: now,
    });

    const [updatedPage] = await tx
      .update(pages)
      .set({ title: input.revision.title, updatedAt: now })
      .where(eq(pages.id, input.pageId))
      .returning();

    await tx.delete(blocks).where(eq(blocks.pageId, input.pageId));

    if (input.revision.blocks.length > 0) {
      await tx.insert(blocks).values(
        input.revision.blocks.map((block) => ({
          id: crypto.randomUUID(),
          pageId: input.pageId,
          type: block.type,
          content: block.content,
          properties: block.properties,
          sortOrder: block.sortOrder,
          createdAt: now,
          updatedAt: now,
        }))
      );
    }

    return updatedPage ?? null;
  });
}

export type BlockDraft = {
  type: string;
  content: string | null;
  properties: Record<string, unknown> | null;
};

export async function importPageWithBlocks(input: {
  pageId: string;
  title: string;
  spaceId: string;
  parentId: string | null;
  authorId: string;
  now: Date;
  blockDrafts: BlockDraft[];
}): Promise<{
  page: {
    id: string;
    title: string;
    spaceId: string;
    parentId: string | null;
    authorId: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  };
  blocks: Array<{
    id: string;
    pageId: string;
    type: string;
    content: string | null;
    properties: Record<string, unknown> | null;
    sortOrder: number;
  }>;
}> {
  return db.transaction(async (tx) => {
    const page = await createPageWithAccessDefaultsTx(tx, {
      id: input.pageId,
      title: input.title,
      spaceId: input.spaceId,
      parentId: input.parentId,
      authorId: input.authorId,
      createdAt: input.now,
      updatedAt: input.now,
    });

    if (input.blockDrafts.length === 0) {
      return { page, blocks: [] };
    }

    const blockValues = input.blockDrafts.map((draft, index) => ({
      id: crypto.randomUUID(),
      pageId: page.id,
      type: draft.type,
      content: draft.content,
      properties: draft.properties,
      sortOrder: index,
      createdAt: input.now,
      updatedAt: input.now,
    }));

    await tx.insert(blocks).values(blockValues);

    return {
      page,
      blocks: blockValues.map(({ id, pageId, type, content, properties, sortOrder }) => ({
        id,
        pageId,
        type,
        content,
        properties,
        sortOrder,
      })),
    };
  });
}

export interface VectorSearchResult {
  pageId: string;
  pageTitle: string;
  chunkText: string;
  similarity: number;
}

export async function searchByVector(
  _queryText: string,
  queryEmbedding: number[],
  limit: number
): Promise<VectorSearchResult[]> {
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

export async function searchPagesByIlike(
  queryText: string,
  limit: number
): Promise<VectorSearchResult[]> {
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
