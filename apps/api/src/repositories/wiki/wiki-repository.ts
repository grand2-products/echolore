import { sql } from "kysely";
import { nanoid } from "nanoid";
import { type DbTransaction, db } from "../../db/index.js";
import type { Block, NewBlock, NewPage, Page } from "../../db/schema.js";
import { escapeLikePattern, firstOrNull } from "../../lib/db-utils.js";

export async function listPagesOrderedByUpdatedAt(): Promise<
  Array<Page & { author_name: string | undefined; space_name: string | undefined }>
> {
  const rows = await db
    .selectFrom("pages")
    .leftJoin("users", "pages.authorId", "users.id")
    .leftJoin("spaces", "pages.spaceId", "spaces.id")
    .select([
      "pages.id",
      "pages.title",
      "pages.spaceId",
      "pages.parentId",
      "pages.authorId",
      "pages.deletedAt",
      "pages.createdAt",
      "pages.updatedAt",
      "users.name as author_name",
      "spaces.name as space_name",
    ])
    .where("pages.deletedAt", "is", null)
    .orderBy("pages.updatedAt", "desc")
    .execute();

  return rows.map((r) => ({
    ...r,
    author_name: r.author_name ?? undefined,
    space_name: r.space_name ?? undefined,
  }));
}

export async function getPageById(id: string): Promise<Page | null> {
  return (await db.selectFrom("pages").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
}

export async function getPageParentId(id: string): Promise<string | null> {
  const page = await db
    .selectFrom("pages")
    .select("parentId")
    .where("id", "=", id)
    .executeTakeFirst();
  return page?.parentId ?? null;
}

export async function getPageBlocks(pageId: string): Promise<Block[]> {
  return db
    .selectFrom("blocks")
    .selectAll()
    .where("pageId", "=", pageId)
    .orderBy("sortOrder")
    .execute();
}

export async function searchPagesLexically(query: string): Promise<Page[]> {
  const escaped = `%${escapeLikePattern(query)}%`;

  return db
    .selectFrom("pages")
    .selectAll()
    .where("deletedAt", "is", null)
    .where((eb) =>
      eb.or([
        eb(
          sql`to_tsvector('simple', coalesce(${sql.ref("pages.title")}, ''))`,
          "@@",
          sql`plainto_tsquery('simple', ${query})`
        ),
        eb.exists(
          db
            .selectFrom("blocks")
            .select(sql`1`.as("one"))
            .where(sql<boolean>`blocks.pageId = pages.id`)
            .where(
              sql`to_tsvector('simple', coalesce(${sql.ref("blocks.content")}, ''))`,
              "@@",
              sql`plainto_tsquery('simple', ${query})`
            )
        ),
        eb(sql`coalesce(${sql.ref("pages.title")}, '')`, "ilike", escaped),
        eb.exists(
          db
            .selectFrom("blocks")
            .select(sql`1`.as("one"))
            .where(sql<boolean>`blocks.pageId = pages.id`)
            .where(sql`coalesce(${sql.ref("blocks.content")}, '')`, "ilike", escaped)
        ),
      ])
    )
    .orderBy("updatedAt", "desc")
    .execute();
}

export async function listBlockContentsByPageIds(
  pageIds: string[]
): Promise<Pick<Block, "pageId" | "content">[]> {
  if (pageIds.length === 0) {
    return [];
  }

  return db
    .selectFrom("blocks")
    .select(["pageId", "content"])
    .where("pageId", "in", pageIds)
    .execute();
}

export async function createPage(newPage: NewPage): Promise<Page | null> {
  return firstOrNull(await db.insertInto("pages").values(newPage).returningAll().execute());
}

export async function updatePage(
  id: string,
  updatePayload: { title?: string; parentId?: string | null; updatedAt: Date }
): Promise<Page | null> {
  return firstOrNull(
    await db.updateTable("pages").set(updatePayload).where("id", "=", id).returningAll().execute()
  );
}

export async function deletePage(id: string): Promise<void> {
  await db.deleteFrom("pages").where("id", "=", id).execute();
}

export async function getBlockById(id: string): Promise<Block | null> {
  return (
    (await db.selectFrom("blocks").selectAll().where("id", "=", id).executeTakeFirst()) ?? null
  );
}

export async function createBlock(newBlock: NewBlock): Promise<Block | null> {
  return firstOrNull(
    await db
      .insertInto("blocks")
      .values({
        ...newBlock,
        properties: newBlock.properties ?? null,
      })
      .returningAll()
      .execute()
  );
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
): Promise<Block | null> {
  const setPayload = { ...updatePayload };
  return firstOrNull(
    await db.updateTable("blocks").set(setPayload).where("id", "=", id).returningAll().execute()
  );
}

export async function deleteBlock(id: string): Promise<void> {
  await db.deleteFrom("blocks").where("id", "=", id).execute();
}

export async function softDeletePage(id: string): Promise<Page | null> {
  return firstOrNull(
    await db
      .updateTable("pages")
      .set({ deletedAt: new Date() })
      .where("id", "=", id)
      .returningAll()
      .execute()
  );
}

export async function restorePage(id: string): Promise<Page | null> {
  return firstOrNull(
    await db
      .updateTable("pages")
      .set({ deletedAt: null })
      .where("id", "=", id)
      .returningAll()
      .execute()
  );
}

export async function listDeletedPages(): Promise<Page[]> {
  return db
    .selectFrom("pages")
    .selectAll()
    .where("deletedAt", "is not", null)
    .orderBy("deletedAt", "desc")
    .execute();
}

export async function permanentDeletePage(id: string): Promise<void> {
  await db.deleteFrom("pages").where("id", "=", id).execute();
}

export async function listNonDeletedPageIds(): Promise<{ id: string }[]> {
  return db.selectFrom("pages").select("id").where("deletedAt", "is", null).execute();
}

export async function deletePageEmbeddingsByPageId(pageId: string): Promise<void> {
  await db.deleteFrom("page_embeddings").where("pageId", "=", pageId).execute();
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
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("page_embeddings").where("pageId", "=", pageId).execute();
    if (embeddings.length > 0) {
      await trx
        .insertInto("page_embeddings")
        .values(
          embeddings.map((e) => ({
            id: `emb_${nanoid(12)}`,
            pageId: pageId,
            chunkIndex: e.chunkIndex,
            plainText: e.plainText,
            embedding: `[${e.embedding.join(",")}]`,
            modelId: e.modelId,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
          }))
        )
        .execute();
    }
  });
}

export async function listUserGroupIdsByUserId(userId: string): Promise<string[]> {
  const memberships = await db
    .selectFrom("user_group_memberships")
    .select("groupId")
    .where("userId", "=", userId)
    .execute();
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
  return db.transaction().execute(async (trx) => createPageWithAccessDefaultsTx(trx, input));
}

export async function createPageWithAccessDefaultsTx(
  trx: DbTransaction,
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
  const page = await trx
    .insertInto("pages")
    .values({
      id: input.id,
      title: input.title,
      spaceId: input.spaceId,
      parentId: input.parentId,
      authorId: input.authorId,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    })
    .returningAll()
    .executeTakeFirst();

  if (!page) {
    throw new Error("Failed to create page");
  }

  await trx
    .insertInto("page_inheritance")
    .values({
      id: `inherit_${nanoid(12)}`,
      pageId: page.id,
      inheritFromParent: Boolean(page.parentId),
      createdAt: input.createdAt,
    })
    .execute();

  if (!page.parentId) {
    const memberships = await trx
      .selectFrom("user_group_memberships")
      .select("groupId")
      .where("userId", "=", input.authorId)
      .execute();

    const uniqueGroupIds = [...new Set(memberships.map((m) => m.groupId))];

    if (uniqueGroupIds.length > 0) {
      await trx
        .insertInto("page_permissions")
        .values(
          uniqueGroupIds.map((groupId) => ({
            id: `perm_${nanoid(12)}`,
            pageId: page.id,
            groupId: groupId,
            canRead: true,
            canWrite: true,
            canDelete: false,
            createdAt: input.createdAt,
            updatedAt: input.updatedAt,
          }))
        )
        .execute();
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

  return db.transaction().execute(async (trx) => {
    await trx
      .insertInto("page_revisions")
      .values({
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
      })
      .execute();

    const updatedPage = await trx
      .updateTable("pages")
      .set({ title: input.revision.title, updatedAt: now })
      .where("id", "=", input.pageId)
      .returningAll()
      .executeTakeFirst();

    await trx.deleteFrom("blocks").where("pageId", "=", input.pageId).execute();

    if (input.revision.blocks.length > 0) {
      await trx
        .insertInto("blocks")
        .values(
          input.revision.blocks.map((block) => ({
            id: crypto.randomUUID(),
            pageId: input.pageId,
            type: block.type,
            content: block.content,
            properties: block.properties ?? null,
            sortOrder: block.sortOrder,
            createdAt: now,
            updatedAt: now,
          }))
        )
        .execute();
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
  return db.transaction().execute(async (trx) => {
    const page = await createPageWithAccessDefaultsTx(trx, {
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

    await trx
      .insertInto("blocks")
      .values(
        blockValues.map((b) => ({
          ...b,
          properties: b.properties ?? null,
        }))
      )
      .execute();

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

  const results = await sql`
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
  `.execute(db);

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

// ---------------------------------------------------------------------------
// Knowledge scan / suggestion helpers
// ---------------------------------------------------------------------------

export async function listRecentUpdatedPages(
  since: Date,
  limit: number
): Promise<Pick<Page, "id" | "title" | "spaceId">[]> {
  return db
    .selectFrom("pages")
    .select(["id", "title", "spaceId"])
    .where("deletedAt", "is", null)
    .where("updatedAt", ">", since)
    .orderBy("updatedAt", "desc")
    .limit(limit)
    .execute();
}

export async function listPageBlockContents(
  pageId: string,
  limit: number
): Promise<Pick<Block, "content" | "type">[]> {
  return db
    .selectFrom("blocks")
    .select(["content", "type"])
    .where("pageId", "=", pageId)
    .orderBy("sortOrder")
    .limit(limit)
    .execute();
}

export async function listActivePageTitles(limit: number): Promise<Pick<Page, "id" | "title">[]> {
  return db
    .selectFrom("pages")
    .select(["id", "title"])
    .where("deletedAt", "is", null)
    .orderBy("updatedAt", "desc")
    .limit(limit)
    .execute();
}

export async function listBlockContentSnippets(
  pageId: string,
  limit: number
): Promise<Pick<Block, "content">[]> {
  return db
    .selectFrom("blocks")
    .select("content")
    .where("pageId", "=", pageId)
    .orderBy("sortOrder")
    .limit(limit)
    .execute();
}

export async function insertBlocks(
  blocksData: Array<{
    id: string;
    pageId: string;
    type: string;
    content: string | null;
    properties: Record<string, unknown> | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }>
): Promise<void> {
  if (blocksData.length === 0) return;
  await db
    .insertInto("blocks")
    .values(
      blocksData.map((b) => ({
        id: b.id,
        pageId: b.pageId,
        type: b.type,
        content: b.content,
        properties: b.properties ?? null,
        sortOrder: b.sortOrder,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      }))
    )
    .execute();
}

export async function updatePageTitleAndReplaceBlocks(input: {
  pageId: string;
  title: string;
  blocks: Array<{
    id: string;
    type: string;
    content: string | null;
    properties: Record<string, unknown> | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  now: Date;
}): Promise<void> {
  return db.transaction().execute(async (trx) => {
    await trx
      .updateTable("pages")
      .set({ title: input.title, updatedAt: input.now })
      .where("id", "=", input.pageId)
      .execute();

    await trx.deleteFrom("blocks").where("pageId", "=", input.pageId).execute();

    if (input.blocks.length > 0) {
      await trx
        .insertInto("blocks")
        .values(
          input.blocks.map((block) => ({
            id: block.id,
            pageId: input.pageId,
            type: block.type,
            content: block.content,
            properties: block.properties ?? null,
            sortOrder: block.sortOrder,
            createdAt: block.createdAt,
            updatedAt: block.updatedAt,
          }))
        )
        .execute();
    }
  });
}

export async function getPageSpaceId(id: string): Promise<string | null> {
  const page = await db
    .selectFrom("pages")
    .select("spaceId")
    .where("id", "=", id)
    .executeTakeFirst();
  return page?.spaceId ?? null;
}

export async function getPageSpaceType(pageId: string): Promise<{
  spaceId: string;
  spaceType: string;
  ownerUserId: string | null;
  groupId: string | null;
} | null> {
  const row = await db
    .selectFrom("pages")
    .innerJoin("spaces", "pages.spaceId", "spaces.id")
    .select(["pages.spaceId", "spaces.type as space_type", "spaces.ownerUserId", "spaces.groupId"])
    .where("pages.id", "=", pageId)
    .executeTakeFirst();

  if (!row) return null;
  return {
    spaceId: row.spaceId,
    spaceType: row.space_type,
    ownerUserId: row.ownerUserId,
    groupId: row.groupId,
  };
}

export async function searchPagesByIlike(
  queryText: string,
  limit: number
): Promise<VectorSearchResult[]> {
  const escaped = queryText.replace(/[%_\\]/g, (ch) => `\\${ch}`);
  const pattern = `%${escaped}%`;

  const results = await sql`
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
  `.execute(db);

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
