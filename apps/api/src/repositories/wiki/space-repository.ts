import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { type NewSpace, spaces } from "../../db/schema.js";

export async function getSpaceById(id: string) {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, id));
  return space ?? null;
}

export async function getGeneralSpace() {
  const [space] = await db.select().from(spaces).where(eq(spaces.type, "general")).limit(1);
  return space ?? null;
}

export async function getPersonalSpaceByUserId(userId: string) {
  const [space] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.type, "personal"), eq(spaces.ownerUserId, userId)));
  return space ?? null;
}

export async function getTeamSpaceByGroupId(groupId: string) {
  const [space] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.type, "team"), eq(spaces.groupId, groupId)));
  return space ?? null;
}

export async function listSpaces() {
  return db.select().from(spaces);
}

export async function createSpace(space: NewSpace) {
  const [created] = await db.insert(spaces).values(space).returning();
  return created ?? null;
}
