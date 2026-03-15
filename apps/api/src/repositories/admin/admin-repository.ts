import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  pageInheritance,
  pagePermissions,
  siteSettings,
  userGroupMemberships,
  userGroups,
  users,
} from "../../db/schema.js";
import { firstOrNull } from "../../lib/db-utils.js";

export async function listGroups() {
  return db.select().from(userGroups);
}

export async function getGroupById(id: string) {
  return firstOrNull(await db.select().from(userGroups).where(eq(userGroups.id, id)));
}

export async function getGroupByName(name: string) {
  return firstOrNull(await db.select().from(userGroups).where(eq(userGroups.name, name)));
}

export async function createGroup(input: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return firstOrNull(await db.insert(userGroups).values(input).returning());
}

export async function updateGroup(
  id: string,
  input: {
    name: string;
    description: string | null;
    permissions: string[];
    updatedAt: Date;
  }
) {
  return firstOrNull(
    await db.update(userGroups).set(input).where(eq(userGroups.id, id)).returning()
  );
}

export async function deleteGroup(id: string) {
  await db.delete(userGroupMemberships).where(eq(userGroupMemberships.groupId, id));
  await db.delete(userGroups).where(eq(userGroups.id, id));
}

export async function listMemberships() {
  return db.select().from(userGroupMemberships);
}

export async function listMembershipsByGroup(groupId: string) {
  return db.select().from(userGroupMemberships).where(eq(userGroupMemberships.groupId, groupId));
}

export async function deleteMembership(groupId: string, userId: string) {
  return firstOrNull(
    await db
      .delete(userGroupMemberships)
      .where(
        and(eq(userGroupMemberships.groupId, groupId), eq(userGroupMemberships.userId, userId))
      )
      .returning()
  );
}

export async function listUsersWithIds(userIds: string[]) {
  if (userIds.length === 0) return [];
  return db.select().from(users).where(inArray(users.id, userIds));
}

export async function listUsersForAdmin() {
  return db.select().from(users);
}

export async function listPagePermissions(pageId: string) {
  return db.select().from(pagePermissions).where(eq(pagePermissions.pageId, pageId));
}

export async function getPageInheritance(pageId: string) {
  return firstOrNull(
    await db.select().from(pageInheritance).where(eq(pageInheritance.pageId, pageId))
  );
}

export async function deletePagePermission(pageId: string, groupId: string) {
  return firstOrNull(
    await db
      .delete(pagePermissions)
      .where(and(eq(pagePermissions.pageId, pageId), eq(pagePermissions.groupId, groupId)))
      .returning()
  );
}

export async function getSiteSetting(key: string) {
  return firstOrNull(await db.select().from(siteSettings).where(eq(siteSettings.key, key)));
}

export async function updateUserRole(userId: string, role: string) {
  return firstOrNull(
    await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning()
  );
}

export async function upsertSiteSetting(key: string, value: string) {
  const now = new Date();
  return firstOrNull(
    await db
      .insert(siteSettings)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value, updatedAt: now },
      })
      .returning()
  );
}

export async function deleteSiteSetting(key: string) {
  return firstOrNull(await db.delete(siteSettings).where(eq(siteSettings.key, key)).returning());
}
