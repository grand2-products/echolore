import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { type NewPageRevision, pageRevisions } from "../../db/schema.js";

export async function createRevision(data: NewPageRevision) {
  const [revision] = await db.insert(pageRevisions).values(data).returning();
  return revision ?? null;
}

export async function listRevisionsByPageId(pageId: string) {
  return db
    .select()
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, pageId))
    .orderBy(desc(pageRevisions.revisionNumber));
}

export async function getRevisionById(id: string) {
  const [revision] = await db
    .select()
    .from(pageRevisions)
    .where(eq(pageRevisions.id, id));
  return revision ?? null;
}

export async function getNextRevisionNumber(pageId: string) {
  const [result] = await db
    .select({
      next: sql<number>`coalesce(max(${pageRevisions.revisionNumber}), 0) + 1`,
    })
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, pageId));
  return result?.next ?? 1;
}
