import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { type NewSpace, spaces } from "../../db/schema.js";
import { firstOrNull } from "../../lib/db-utils.js";

export async function getSpaceById(id: string) {
  return firstOrNull(await db.select().from(spaces).where(eq(spaces.id, id)));
}

export async function findGeneralSpace() {
  return firstOrNull(await db.select().from(spaces).where(eq(spaces.type, "general")).limit(1));
}

export async function findPersonalSpaceByUserId(userId: string) {
  return firstOrNull(
    await db
      .select()
      .from(spaces)
      .where(and(eq(spaces.type, "personal"), eq(spaces.ownerUserId, userId)))
  );
}

export async function findTeamSpaceByGroupId(groupId: string) {
  return firstOrNull(
    await db
      .select()
      .from(spaces)
      .where(and(eq(spaces.type, "team"), eq(spaces.groupId, groupId)))
  );
}

export async function listSpaces() {
  return db.select().from(spaces);
}

export async function createSpace(space: NewSpace) {
  return firstOrNull(await db.insert(spaces).values(space).returning());
}
