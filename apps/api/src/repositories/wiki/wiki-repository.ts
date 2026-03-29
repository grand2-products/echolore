import { sql } from "kysely";
import { nanoid } from "nanoid";
import { type DbTransaction, db } from "../../db/index.js";
import type { NewBlock, NewPage } from "../../db/schema.js";
import { escapeLikePattern, firstOrNull, getRecordById } from "../../lib/db-utils.js";

export async function listPagesOrderedByUpdatedAt() {
  const rows = await db
    .selectFrom("pages")
    .leftJoin("users", "pages.author_id", "users.id")
    .leftJoin("spaces", "pages.space_id", "spaces.id")
    .select([
      "pages.id",
      "pages.title",
      "pages.space_id",
      "pages.parent_id",
      "pages.author_id",
      "pages.deleted_at",
      "pages.created_at",
      "pages.updated_at",
      "users.name as author_name",
      "spaces.name as space_name",
    ])
    .where("pages.deleted_at", "is", null)
    .orderBy("pages.updated_at", "desc")
    .execute();

  return rows.map((r) => ({
    ...r,
    author_name: r.author_name ?? undefined,
    space_name: r.space_name ?? undefined,
  }));
}

export async function getPageById(id: string) {
  return getRecordById("pages", id);
}

export async function getPageParentId(id: string) {
  const page = await db
    .selectFrom("pages")
    .select("parent_id")
    .where("id", "=", id)
    .executeTakeFirst();
  return page?.parent_id ?? null;
}

export async function getPageBlocks(pageId: string) {
  return db
    .selectFrom("blocks")
    .selectAll()
    .where("page_id", "=", pageId)
    .orderBy("sort_order")
    .execute();
}

export async function searchPagesLexically(query: string) {
  const escaped = `%${escapeLikePattern(query)}%`;

  return db
    .selectFrom("pages")
    .selectAll()
    .where("deleted_at", "is", null)
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
            .where(sql<boolean>`blocks.page_id = pages.id`)
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
            .where(sql<boolean>`blocks.page_id = pages.id`)
            .where(sql`coalesce(${sql.ref("blocks.content")}, '')`, "ilike", escaped)
        ),
      ])
    )
    .orderBy("updated_at", "desc")
    .execute();
}

export async function listBlockContentsByPageIds(pageIds: string[]) {
  if (pageIds.length === 0) {
    return [];
  }

  return db
    .selectFrom("blocks")
    .select(["page_id", "content"])
    .where("page_id", "in", pageIds)
    .execute();
}

export async function createPage(newPage: NewPage) {
  return firstOrNull(await db.insertInto("pages").values(newPage).returningAll().execute());
}

export async function updatePage(
  id: string,
  updatePayload: { title?: string; parent_id?: string | null; updated_at: Date }
) {
  return firstOrNull(
    await db.updateTable("pages").set(updatePayload).where("id", "=", id).returningAll().execute()
  );
}

export async function deletePage(id: string) {
  await db.deleteFrom("pages").where("id", "=", id).execute();
}

export async function getBlockById(id: string) {
  return getRecordById("blocks", id);
}

export async function createBlock(newBlock: NewBlock) {
  return firstOrNull(await db.insertInto("blocks").values(newBlock).returningAll().execute());
}

export async function updateBlock(
  id: string,
  updatePayload: {
    type?: string;
    content?: string | null;
    properties?: Record<string, unknown> | null;
    sort_order?: number;
    updated_at: Date;
  }
) {
  return firstOrNull(
    await db.updateTable("blocks").set(updatePayload).where("id", "=", id).returningAll().execute()
  );
}

export async function deleteBlock(id: string) {
  await db.deleteFrom("blocks").where("id", "=", id).execute();
}

export async function softDeletePage(id: string) {
  return firstOrNull(
    await db
      .updateTable("pages")
      .set({ deleted_at: new Date() })
      .where("id", "=", id)
      .returningAll()
      .execute()
  );
}

export async function restorePage(id: string) {
  return firstOrNull(
    await db
      .updateTable("pages")
      .set({ deleted_at: null })
      .where("id", "=", id)
      .returningAll()
      .execute()
  );
}

export async function listDeletedPages() {
  return db
    .selectFrom("pages")
    .selectAll()
    .where("deleted_at", "is not", null)
    .orderBy("deleted_at", "desc")
    .execute();
}

export async function permanentDeletePage(id: string) {
  await db.deleteFrom("pages").where("id", "=", id).execute();
}

export async function listNonDeletedPageIds(): Promise<{ id: string }[]> {
  return db.selectFrom("pages").select("id").where("deleted_at", "is", null).execute();
}

export async function deletePageEmbeddingsByPageId(pageId: string): Promise<void> {
  await db.deleteFrom("page_embeddings").where("page_id", "=", pageId).execute();
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
    await trx.deleteFrom("page_embeddings").where("page_id", "=", pageId).execute();
    if (embeddings.length > 0) {
      await trx
        .insertInto("page_embeddings")
        .values(
          embeddings.map((e) => ({
            id: `emb_${nanoid(12)}`,
            page_id: pageId,
            chunk_index: e.chunkIndex,
            plain_text: e.plainText,
            // biome-ignore lint/suspicious/noExplicitAny: pgvector string passed to raw column
            embedding: e.embedding as any,
            model_id: e.modelId,
            created_at: e.createdAt,
            updated_at: e.updatedAt,
          }))
        )
        .execute();
    }
  });
}

export async function listUserGroupIdsByUserId(userId: string): Promise<string[]> {
  const memberships = await db
    .selectFrom("user_group_memberships")
    .select("group_id")
    .where("user_id", "=", userId)
    .execute();
  return [...new Set(memberships.map((m) => m.group_id))];
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
  space_id: string;
  parent_id: string | null;
  author_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
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
  space_id: string;
  parent_id: string | null;
  author_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}> {
  const page = await trx
    .insertInto("pages")
    .values({
      id: input.id,
      title: input.title,
      space_id: input.spaceId,
      parent_id: input.parentId,
      author_id: input.authorId,
      created_at: input.createdAt,
      updated_at: input.updatedAt,
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
      page_id: page.id,
      inherit_from_parent: Boolean(page.parent_id),
      created_at: input.createdAt,
    })
    .execute();

  if (!page.parent_id) {
    const memberships = await trx
      .selectFrom("user_group_memberships")
      .select("group_id")
      .where("user_id", "=", input.authorId)
      .execute();

    const uniqueGroupIds = [...new Set(memberships.map((m) => m.group_id))];

    if (uniqueGroupIds.length > 0) {
      await trx
        .insertInto("page_permissions")
        .values(
          uniqueGroupIds.map((groupId) => ({
            id: `perm_${nanoid(12)}`,
            page_id: page.id,
            group_id: groupId,
            can_read: true,
            can_write: true,
            can_delete: false,
            created_at: input.createdAt,
            updated_at: input.updatedAt,
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
}): Promise<{ id: string; title: string; updated_at: Date } | null> {
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    await trx
      .insertInto("page_revisions")
      .values({
        id: `rev_${crypto.randomUUID().slice(0, 12)}`,
        page_id: input.pageId,
        revision_number: input.revisionNumber,
        title: input.currentTitle,
        blocks: input.currentBlocks.map((b) => ({
          type: b.type,
          content: b.content,
          properties: b.properties as Record<string, unknown> | null,
          sortOrder: b.sortOrder,
        })),
        author_id: input.actorUserId,
        created_at: now,
      })
      .execute();

    const updatedPage = await trx
      .updateTable("pages")
      .set({ title: input.revision.title, updated_at: now })
      .where("id", "=", input.pageId)
      .returningAll()
      .executeTakeFirst();

    await trx.deleteFrom("blocks").where("page_id", "=", input.pageId).execute();

    if (input.revision.blocks.length > 0) {
      await trx
        .insertInto("blocks")
        .values(
          input.revision.blocks.map((block) => ({
            id: crypto.randomUUID(),
            page_id: input.pageId,
            type: block.type,
            content: block.content,
            properties: block.properties,
            sort_order: block.sortOrder,
            created_at: now,
            updated_at: now,
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
    space_id: string;
    parent_id: string | null;
    author_id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  };
  blocks: Array<{
    id: string;
    page_id: string;
    type: string;
    content: string | null;
    properties: Record<string, unknown> | null;
    sort_order: number;
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
      page_id: page.id,
      type: draft.type,
      content: draft.content,
      properties: draft.properties,
      sort_order: index,
      created_at: input.now,
      updated_at: input.now,
    }));

    await trx.insertInto("blocks").values(blockValues).execute();

    return {
      page,
      blocks: blockValues.map(({ id, page_id, type, content, properties, sort_order }) => ({
        id,
        page_id,
        type,
        content,
        properties,
        sort_order,
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

export async function listRecentUpdatedPages(since: Date, limit: number) {
  return db
    .selectFrom("pages")
    .select(["id", "title", "space_id"])
    .where("deleted_at", "is", null)
    .where("updated_at", ">", since)
    .orderBy("updated_at", "desc")
    .limit(limit)
    .execute();
}

export async function listPageBlockContents(pageId: string, limit: number) {
  return db
    .selectFrom("blocks")
    .select(["content", "type"])
    .where("page_id", "=", pageId)
    .orderBy("sort_order")
    .limit(limit)
    .execute();
}

export async function listActivePageTitles(limit: number) {
  return db
    .selectFrom("pages")
    .select(["id", "title"])
    .where("deleted_at", "is", null)
    .orderBy("updated_at", "desc")
    .limit(limit)
    .execute();
}

export async function listBlockContentSnippets(pageId: string, limit: number) {
  return db
    .selectFrom("blocks")
    .select("content")
    .where("page_id", "=", pageId)
    .orderBy("sort_order")
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
) {
  if (blocksData.length === 0) return;
  await db
    .insertInto("blocks")
    .values(
      blocksData.map((b) => ({
        id: b.id,
        page_id: b.pageId,
        type: b.type,
        content: b.content,
        properties: b.properties,
        sort_order: b.sortOrder,
        created_at: b.createdAt,
        updated_at: b.updatedAt,
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
}) {
  return db.transaction().execute(async (trx) => {
    await trx
      .updateTable("pages")
      .set({ title: input.title, updated_at: input.now })
      .where("id", "=", input.pageId)
      .execute();

    await trx.deleteFrom("blocks").where("page_id", "=", input.pageId).execute();

    if (input.blocks.length > 0) {
      await trx
        .insertInto("blocks")
        .values(
          input.blocks.map((block) => ({
            id: block.id,
            page_id: input.pageId,
            type: block.type,
            content: block.content,
            properties: block.properties,
            sort_order: block.sortOrder,
            created_at: block.createdAt,
            updated_at: block.updatedAt,
          }))
        )
        .execute();
    }
  });
}

export async function getPageSpaceId(id: string) {
  const page = await db
    .selectFrom("pages")
    .select("space_id")
    .where("id", "=", id)
    .executeTakeFirst();
  return page?.space_id ?? null;
}

export async function getPageSpaceType(pageId: string): Promise<{
  spaceId: string;
  spaceType: string;
  ownerUserId: string | null;
  groupId: string | null;
} | null> {
  const row = await db
    .selectFrom("pages")
    .innerJoin("spaces", "pages.space_id", "spaces.id")
    .select([
      "pages.space_id",
      "spaces.type as space_type",
      "spaces.owner_user_id",
      "spaces.group_id",
    ])
    .where("pages.id", "=", pageId)
    .executeTakeFirst();

  if (!row) return null;
  return {
    spaceId: row.space_id,
    spaceType: row.space_type,
    ownerUserId: row.owner_user_id,
    groupId: row.group_id,
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
