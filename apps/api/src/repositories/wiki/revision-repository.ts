import { sql } from "kysely";
import { db } from "../../db/index.js";
import type { NewPageRevision } from "../../db/schema.js";

export async function createRevision(data: NewPageRevision) {
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

export async function listRevisionsByPageId(pageId: string) {
  return db
    .selectFrom("page_revisions")
    .selectAll()
    .where("pageId", "=", pageId)
    .orderBy("revisionNumber", "desc")
    .execute();
}

export async function getRevisionById(id: string) {
  return (
    (await db.selectFrom("page_revisions").selectAll().where("id", "=", id).executeTakeFirst()) ??
    null
  );
}

export async function getNextRevisionNumber(pageId: string) {
  const result = await db
    .selectFrom("page_revisions")
    .select(sql<number>`coalesce(max(revision_number), 0) + 1`.as("next"))
    .where("pageId", "=", pageId)
    .executeTakeFirst();
  return result?.next ?? 1;
}
