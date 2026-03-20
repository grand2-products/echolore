import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  pageInheritance,
  pagePermissions,
  siteSettings,
  spacePermissions,
  userGroupMemberships,
  userGroups,
  users,
} from "../../db/schema.js";
import { firstOrNull, getRecordById } from "../../lib/db-utils.js";

export async function listGroups() {
  return db.select().from(userGroups);
}

export async function getGroupById(id: string) {
  return getRecordById(userGroups, id);
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

export async function listMembershipsByUser(userId: string) {
  return db.select().from(userGroupMemberships).where(eq(userGroupMemberships.userId, userId));
}

export async function listSpacePermissionsByGroupIds(groupIds: string[]) {
  if (groupIds.length === 0) return [];
  return db.select().from(spacePermissions).where(inArray(spacePermissions.groupId, groupIds));
}

export async function listSpacePermissionsForSpace(spaceId: string, groupIds: string[]) {
  if (groupIds.length === 0) return [];
  return db
    .select()
    .from(spacePermissions)
    .where(and(eq(spacePermissions.spaceId, spaceId), inArray(spacePermissions.groupId, groupIds)));
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

export async function addGroupMembers(
  groupId: string,
  userIds: string[]
): Promise<
  Array<{ id: string; userId: string; groupId: string; addedBy: string | null; createdAt: Date }>
> {
  const { nanoid } = await import("nanoid");
  const now = new Date();
  const records: Array<{
    id: string;
    userId: string;
    groupId: string;
    addedBy: string | null;
    createdAt: Date;
  }> = [];

  return db.transaction(async (tx) => {
    for (const userId of userIds) {
      const [exists] = await tx
        .select()
        .from(userGroupMemberships)
        .where(
          and(eq(userGroupMemberships.groupId, groupId), eq(userGroupMemberships.userId, userId))
        );
      if (exists) continue;

      const [record] = await tx
        .insert(userGroupMemberships)
        .values({
          id: `membership_${nanoid(12)}`,
          userId,
          groupId,
          addedBy: null,
          createdAt: now,
        })
        .returning();

      if (record) records.push(record);
    }

    return records;
  });
}

export async function replaceUserGroups(userId: string, groupIds: string[]): Promise<void> {
  const { nanoid } = await import("nanoid");

  await db.transaction(async (tx) => {
    await tx.delete(userGroupMemberships).where(eq(userGroupMemberships.userId, userId));
    const now = new Date();

    for (const groupId of groupIds) {
      await tx.insert(userGroupMemberships).values({
        id: `membership_${nanoid(12)}`,
        userId,
        groupId,
        addedBy: null,
        createdAt: now,
      });
    }
  });
}

export async function replacePagePermissions(
  pageId: string,
  inheritFromParent: boolean,
  permissions: Array<{
    groupId: string;
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
  }>
): Promise<void> {
  const { nanoid } = await import("nanoid");
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.delete(pagePermissions).where(eq(pagePermissions.pageId, pageId));
    await tx.delete(pageInheritance).where(eq(pageInheritance.pageId, pageId));

    await tx.insert(pageInheritance).values({
      id: `inherit_${nanoid(12)}`,
      pageId,
      inheritFromParent,
      createdAt: now,
    });

    for (const permission of permissions) {
      await tx.insert(pagePermissions).values({
        id: `perm_${nanoid(12)}`,
        pageId,
        groupId: permission.groupId,
        canRead: permission.canRead,
        canWrite: permission.canWrite,
        canDelete: permission.canDelete,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

export async function replacePageInheritance(
  pageId: string,
  inheritFromParent: boolean
): Promise<void> {
  const { nanoid } = await import("nanoid");

  await db.transaction(async (tx) => {
    await tx.delete(pageInheritance).where(eq(pageInheritance.pageId, pageId));
    await tx.insert(pageInheritance).values({
      id: `inherit_${nanoid(12)}`,
      pageId,
      inheritFromParent,
      createdAt: new Date(),
    });
  });
}

export async function listSpacePermissions(spaceId: string) {
  return db.select().from(spacePermissions).where(eq(spacePermissions.spaceId, spaceId));
}

export async function replaceSpacePermissions(
  spaceId: string,
  permissions: Array<{
    groupId: string;
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
  }>
): Promise<void> {
  const { nanoid } = await import("nanoid");
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.delete(spacePermissions).where(eq(spacePermissions.spaceId, spaceId));

    for (const permission of permissions) {
      await tx.insert(spacePermissions).values({
        id: `sp_${nanoid(12)}`,
        spaceId,
        groupId: permission.groupId,
        canRead: permission.canRead,
        canWrite: permission.canWrite,
        canDelete: permission.canDelete,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

export async function deleteSpacePermissionForGroup(
  spaceId: string,
  groupId: string
): Promise<boolean> {
  const result = await db
    .delete(spacePermissions)
    .where(and(eq(spacePermissions.spaceId, spaceId), eq(spacePermissions.groupId, groupId)))
    .returning();
  return result.length > 0;
}

export async function getGroupPermissionsByIds(groupIds: string[]) {
  if (groupIds.length === 0) return [];
  return db
    .select({ id: userGroups.id, permissions: userGroups.permissions })
    .from(userGroups)
    .where(inArray(userGroups.id, groupIds));
}
