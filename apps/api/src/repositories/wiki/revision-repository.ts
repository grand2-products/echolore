import { sql } from "kysely";
import { db } from "../../db/index.js";
import type { NewPageRevision, PageRevision } from "../../db/schema.js";

export async function createRevision(data: NewPageRevision): Promise<PageRevision | null> {
  return (
    (await db
      .insertInto("page_revisions")
      .values({
        ...data,
        blocks: data.blocks,
      })
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function listRevisionsByPageId(pageId: string): Promise<PageRevision[]> {
  return db
    .selectFrom("page_revisions")
    .selectAll()
    .where("pageId", "=", pageId)
    .orderBy("revisionNumber", "desc")
    .execute();
}

export async function getRevisionById(id: string): Promise<PageRevision | null> {
  return (
    (await db.selectFrom("page_revisions").selectAll().where("id", "=", id).executeTakeFirst()) ??
    null
  );
}

export async function getNextRevisionNumber(pageId: string): Promise<number> {
  const result = await db
    .selectFrom("page_revisions")
    .select(sql<number>`coalesce(max(revision_number), 0) + 1`.as("next"))
    .where("pageId", "=", pageId)
    .executeTakeFirst();
  return result?.next ?? 1;
}
