import { db } from "../../db/index.js";
import type {
  PageInheritance,
  PagePermission,
  SiteSetting,
  SpacePermission,
  User,
  UserGroup,
  UserGroupMembership,
} from "../../db/schema.js";
import { firstOrNull } from "../../lib/db-utils.js";

export async function listGroups(): Promise<UserGroup[]> {
  return db.selectFrom("user_groups").selectAll().execute();
}

export async function getGroupById(id: string): Promise<UserGroup | null> {
  return (
    (await db.selectFrom("user_groups").selectAll().where("id", "=", id).executeTakeFirst()) ?? null
  );
}

export async function getGroupByName(name: string): Promise<UserGroup | null> {
  return firstOrNull(
    await db.selectFrom("user_groups").selectAll().where("name", "=", name).execute()
  );
}

export async function createGroup(input: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}): Promise<UserGroup | null> {
  return firstOrNull(
    await db
      .insertInto("user_groups")
      .values({
        id: input.id,
        name: input.name,
        description: input.description,
        isSystem: input.isSystem,
        permissions: input.permissions,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })
      .returningAll()
      .execute()
  );
}

export async function updateGroup(
  id: string,
  input: {
    name: string;
    description: string | null;
    permissions: string[];
    updatedAt: Date;
  }
): Promise<UserGroup | null> {
  return firstOrNull(
    await db
      .updateTable("user_groups")
      .set({
        name: input.name,
        description: input.description,
        permissions: input.permissions,
        updatedAt: input.updatedAt,
      })
      .where("id", "=", id)
      .returningAll()
      .execute()
  );
}

export async function deleteGroup(id: string): Promise<void> {
  await db.deleteFrom("user_group_memberships").where("groupId", "=", id).execute();
  await db.deleteFrom("user_groups").where("id", "=", id).execute();
}

export async function listMemberships(): Promise<UserGroupMembership[]> {
  return db.selectFrom("user_group_memberships").selectAll().execute();
}

export async function listMembershipsByGroup(groupId: string): Promise<UserGroupMembership[]> {
  return db
    .selectFrom("user_group_memberships")
    .selectAll()
    .where("groupId", "=", groupId)
    .execute();
}

export async function listMembershipsByUser(userId: string): Promise<UserGroupMembership[]> {
  return db.selectFrom("user_group_memberships").selectAll().where("userId", "=", userId).execute();
}

export async function listSpacePermissionsByGroupIds(
  groupIds: string[]
): Promise<SpacePermission[]> {
  if (groupIds.length === 0) return [];
  return db.selectFrom("space_permissions").selectAll().where("groupId", "in", groupIds).execute();
}

export async function listSpacePermissionsForSpace(
  spaceId: string,
  groupIds: string[]
): Promise<SpacePermission[]> {
  if (groupIds.length === 0) return [];
  return db
    .selectFrom("space_permissions")
    .selectAll()
    .where("spaceId", "=", spaceId)
    .where("groupId", "in", groupIds)
    .execute();
}

export async function deleteMembership(
  groupId: string,
  userId: string
): Promise<UserGroupMembership | null> {
  return firstOrNull(
    await db
      .deleteFrom("user_group_memberships")
      .where("groupId", "=", groupId)
      .where("userId", "=", userId)
      .returningAll()
      .execute()
  );
}

export async function listUsersWithIds(userIds: string[]): Promise<User[]> {
  if (userIds.length === 0) return [];
  return db.selectFrom("users").selectAll().where("id", "in", userIds).execute();
}

export async function listUsersForAdmin(): Promise<User[]> {
  return db.selectFrom("users").selectAll().execute();
}

export async function listPagePermissions(pageId: string): Promise<PagePermission[]> {
  return db.selectFrom("page_permissions").selectAll().where("pageId", "=", pageId).execute();
}

export async function getPageInheritance(pageId: string): Promise<PageInheritance | null> {
  return firstOrNull(
    await db.selectFrom("page_inheritance").selectAll().where("pageId", "=", pageId).execute()
  );
}

export async function deletePagePermission(
  pageId: string,
  groupId: string
): Promise<PagePermission | null> {
  return firstOrNull(
    await db
      .deleteFrom("page_permissions")
      .where("pageId", "=", pageId)
      .where("groupId", "=", groupId)
      .returningAll()
      .execute()
  );
}

export async function getSiteSetting(key: string): Promise<SiteSetting | null> {
  return firstOrNull(
    await db.selectFrom("site_settings").selectAll().where("key", "=", key).execute()
  );
}

export async function updateUserRole(userId: string, role: string): Promise<User | null> {
  return firstOrNull(
    await db
      .updateTable("users")
      .set({ role, updatedAt: new Date() })
      .where("id", "=", userId)
      .returningAll()
      .execute()
  );
}

export async function upsertSiteSetting(key: string, value: string): Promise<SiteSetting | null> {
  const now = new Date();
  return firstOrNull(
    await db
      .insertInto("site_settings")
      .values({ key, value, updatedAt: now })
      .onConflict((oc) => oc.column("key").doUpdateSet({ value, updatedAt: now }))
      .returningAll()
      .execute()
  );
}

export async function deleteSiteSetting(key: string): Promise<SiteSetting | null> {
  return firstOrNull(
    await db.deleteFrom("site_settings").where("key", "=", key).returningAll().execute()
  );
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

  return db.transaction().execute(async (trx) => {
    for (const userId of userIds) {
      const exists = await trx
        .selectFrom("user_group_memberships")
        .selectAll()
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .executeTakeFirst();
      if (exists) continue;

      const record = await trx
        .insertInto("user_group_memberships")
        .values({
          id: `membership_${nanoid(12)}`,
          userId: userId,
          groupId: groupId,
          addedBy: null,
          createdAt: now,
        })
        .returningAll()
        .executeTakeFirst();

      if (record) {
        records.push({
          id: record.id,
          userId: record.userId,
          groupId: record.groupId,
          addedBy: record.addedBy,
          createdAt: record.createdAt,
        });
      }
    }

    return records;
  });
}

export async function replaceUserGroups(userId: string, groupIds: string[]): Promise<void> {
  const { nanoid } = await import("nanoid");

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("user_group_memberships").where("userId", "=", userId).execute();
    const now = new Date();

    for (const groupId of groupIds) {
      await trx
        .insertInto("user_group_memberships")
        .values({
          id: `membership_${nanoid(12)}`,
          userId: userId,
          groupId: groupId,
          addedBy: null,
          createdAt: now,
        })
        .execute();
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

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("page_permissions").where("pageId", "=", pageId).execute();
    await trx.deleteFrom("page_inheritance").where("pageId", "=", pageId).execute();

    await trx
      .insertInto("page_inheritance")
      .values({
        id: `inherit_${nanoid(12)}`,
        pageId: pageId,
        inheritFromParent: inheritFromParent,
        createdAt: now,
      })
      .execute();

    for (const permission of permissions) {
      await trx
        .insertInto("page_permissions")
        .values({
          id: `perm_${nanoid(12)}`,
          pageId: pageId,
          groupId: permission.groupId,
          canRead: permission.canRead,
          canWrite: permission.canWrite,
          canDelete: permission.canDelete,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  });
}

export async function replacePageInheritance(
  pageId: string,
  inheritFromParent: boolean
): Promise<void> {
  const { nanoid } = await import("nanoid");

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("page_inheritance").where("pageId", "=", pageId).execute();
    await trx
      .insertInto("page_inheritance")
      .values({
        id: `inherit_${nanoid(12)}`,
        pageId: pageId,
        inheritFromParent: inheritFromParent,
        createdAt: new Date(),
      })
      .execute();
  });
}

export async function listSpacePermissions(spaceId: string): Promise<SpacePermission[]> {
  return db.selectFrom("space_permissions").selectAll().where("spaceId", "=", spaceId).execute();
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

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("space_permissions").where("spaceId", "=", spaceId).execute();

    for (const permission of permissions) {
      await trx
        .insertInto("space_permissions")
        .values({
          id: `sp_${nanoid(12)}`,
          spaceId: spaceId,
          groupId: permission.groupId,
          canRead: permission.canRead,
          canWrite: permission.canWrite,
          canDelete: permission.canDelete,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  });
}

export async function deleteSpacePermissionForGroup(
  spaceId: string,
  groupId: string
): Promise<boolean> {
  const result = await db
    .deleteFrom("space_permissions")
    .where("spaceId", "=", spaceId)
    .where("groupId", "=", groupId)
    .returningAll()
    .execute();
  return result.length > 0;
}

export async function getGroupPermissionsByIds(
  groupIds: string[]
): Promise<Pick<UserGroup, "id" | "permissions">[]> {
  if (groupIds.length === 0) return [];
  return db
    .selectFrom("user_groups")
    .select(["id", "permissions"])
    .where("id", "in", groupIds)
    .execute();
}
