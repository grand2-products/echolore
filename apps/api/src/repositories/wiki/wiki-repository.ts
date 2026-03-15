import { and, desc, eq, exists, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { type NewBlock, type NewPage, blocks, pages, spaces, users } from "../../db/schema.js";

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
  const [page] = await db.select().from(pages).where(eq(pages.id, id));
  return page ?? null;
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
        or(titleMatch, blockMatch, sql<boolean>`coalesce(${pages.title}, '') ilike ${`%${query}%`}`)
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
  const [page] = await db.insert(pages).values(newPage).returning();
  return page ?? null;
}

export async function updatePage(
  id: string,
  updatePayload: { title?: string; parentId?: string | null; updatedAt: Date }
) {
  const [page] = await db.update(pages).set(updatePayload).where(eq(pages.id, id)).returning();
  return page ?? null;
}

export async function deletePage(id: string) {
  await db.delete(pages).where(eq(pages.id, id));
}

export async function getBlockById(id: string) {
  const [block] = await db.select().from(blocks).where(eq(blocks.id, id));
  return block ?? null;
}

export async function createBlock(newBlock: NewBlock) {
  const [block] = await db.insert(blocks).values(newBlock).returning();
  return block ?? null;
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
  const [block] = await db.update(blocks).set(updatePayload).where(eq(blocks.id, id)).returning();
  return block ?? null;
}

export async function deleteBlock(id: string) {
  await db.delete(blocks).where(eq(blocks.id, id));
}

export async function softDeletePage(id: string) {
  const [page] = await db
    .update(pages)
    .set({ deletedAt: new Date() })
    .where(eq(pages.id, id))
    .returning();
  return page ?? null;
}

export async function restorePage(id: string) {
  const [page] = await db
    .update(pages)
    .set({ deletedAt: null })
    .where(eq(pages.id, id))
    .returning();
  return page ?? null;
}

export async function listDeletedPages() {
  return db.select().from(pages).where(isNotNull(pages.deletedAt)).orderBy(desc(pages.deletedAt));
}

export async function permanentDeletePage(id: string) {
  await db.delete(pages).where(eq(pages.id, id));
}
