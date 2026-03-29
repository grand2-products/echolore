import { sql } from "kysely";
import { db } from "../../db/index.js";
import type { NewSpace, Space } from "../../db/schema.js";

export async function getSpaceById(id: string): Promise<Space | null> {
  return (
    (await db.selectFrom("spaces").selectAll().where("id", "=", id).executeTakeFirst()) ?? null
  );
}

export async function findGeneralSpace(): Promise<Space | null> {
  return (
    (await db.selectFrom("spaces").selectAll().where("type", "=", "general").executeTakeFirst()) ??
    null
  );
}

export async function findPersonalSpaceByUserId(userId: string): Promise<Space | null> {
  return (
    (await db
      .selectFrom("spaces")
      .selectAll()
      .where("type", "=", "personal")
      .where("ownerUserId", "=", userId)
      .executeTakeFirst()) ?? null
  );
}

export async function findTeamSpaceByGroupId(groupId: string): Promise<Space | null> {
  return (
    (await db
      .selectFrom("spaces")
      .selectAll()
      .where("type", "=", "team")
      .where("groupId", "=", groupId)
      .executeTakeFirst()) ?? null
  );
}

export async function listSpaces(): Promise<Space[]> {
  return db
    .selectFrom("spaces")
    .selectAll()
    .orderBy(
      sql`CASE type WHEN 'general' THEN 0 WHEN 'team' THEN 1 WHEN 'personal' THEN 2 ELSE 3 END`
    )
    .orderBy("name", "asc")
    .execute();
}

export async function createSpace(space: NewSpace): Promise<Space | null> {
  return (await db.insertInto("spaces").values(space).returningAll().executeTakeFirst()) ?? null;
}
