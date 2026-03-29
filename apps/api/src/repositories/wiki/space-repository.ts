import { sql } from "kysely";
import { db } from "../../db/index.js";
import type { NewSpace } from "../../db/schema.js";

export async function getSpaceById(id: string) {
  return (
    (await db.selectFrom("spaces").selectAll().where("id", "=", id).executeTakeFirst()) ?? null
  );
}

export async function findGeneralSpace() {
  return (
    (await db.selectFrom("spaces").selectAll().where("type", "=", "general").executeTakeFirst()) ??
    null
  );
}

export async function findPersonalSpaceByUserId(userId: string) {
  return (
    (await db
      .selectFrom("spaces")
      .selectAll()
      .where("type", "=", "personal")
      .where("ownerUserId", "=", userId)
      .executeTakeFirst()) ?? null
  );
}

export async function findTeamSpaceByGroupId(groupId: string) {
  return (
    (await db
      .selectFrom("spaces")
      .selectAll()
      .where("type", "=", "team")
      .where("groupId", "=", groupId)
      .executeTakeFirst()) ?? null
  );
}

export async function listSpaces() {
  return db
    .selectFrom("spaces")
    .selectAll()
    .orderBy(
      sql`CASE type WHEN 'general' THEN 0 WHEN 'team' THEN 1 WHEN 'personal' THEN 2 ELSE 3 END`
    )
    .orderBy("name", "asc")
    .execute();
}

export async function createSpace(space: NewSpace) {
  return (await db.insertInto("spaces").values(space).returningAll().executeTakeFirst()) ?? null;
}
