import { db } from "../../db/index.js";
import { firstOrNull, getRecordById } from "../../lib/db-utils.js";

export async function listGroups() {
  return db.selectFrom("user_groups").selectAll().execute();
}

export async function getGroupById(id: string) {
  return getRecordById("user_groups", id);
}

export async function getGroupByName(name: string) {
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
}) {
  return firstOrNull(
    await db
      .insertInto("user_groups")
      .values({
        id: input.id,
        name: input.name,
        description: input.description,
        is_system: input.isSystem,
        permissions: input.permissions,
        created_at: input.createdAt,
        updated_at: input.updatedAt,
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
) {
  return firstOrNull(
    await db
      .updateTable("user_groups")
      .set({
        name: input.name,
        description: input.description,
        permissions: input.permissions,
        updated_at: input.updatedAt,
      })
      .where("id", "=", id)
      .returningAll()
      .execute()
  );
}

export async function deleteGroup(id: string) {
  await db.deleteFrom("user_group_memberships").where("group_id", "=", id).execute();
  await db.deleteFrom("user_groups").where("id", "=", id).execute();
}

export async function listMemberships() {
  return db.selectFrom("user_group_memberships").selectAll().execute();
}

export async function listMembershipsByGroup(groupId: string) {
  return db
    .selectFrom("user_group_memberships")
    .selectAll()
    .where("group_id", "=", groupId)
    .execute();
}

export async function listMembershipsByUser(userId: string) {
  return db
    .selectFrom("user_group_memberships")
    .selectAll()
    .where("user_id", "=", userId)
    .execute();
}

export async function listSpacePermissionsByGroupIds(groupIds: string[]) {
  if (groupIds.length === 0) return [];
  return db.selectFrom("space_permissions").selectAll().where("group_id", "in", groupIds).execute();
}

export async function listSpacePermissionsForSpace(spaceId: string, groupIds: string[]) {
  if (groupIds.length === 0) return [];
  return db
    .selectFrom("space_permissions")
    .selectAll()
    .where("space_id", "=", spaceId)
    .where("group_id", "in", groupIds)
    .execute();
}

export async function deleteMembership(groupId: string, userId: string) {
  return firstOrNull(
    await db
      .deleteFrom("user_group_memberships")
      .where("group_id", "=", groupId)
      .where("user_id", "=", userId)
      .returningAll()
      .execute()
  );
}

export async function listUsersWithIds(userIds: string[]) {
  if (userIds.length === 0) return [];
  return db.selectFrom("users").selectAll().where("id", "in", userIds).execute();
}

export async function listUsersForAdmin() {
  return db.selectFrom("users").selectAll().execute();
}

export async function listPagePermissions(pageId: string) {
  return db.selectFrom("page_permissions").selectAll().where("page_id", "=", pageId).execute();
}

export async function getPageInheritance(pageId: string) {
  return firstOrNull(
    await db.selectFrom("page_inheritance").selectAll().where("page_id", "=", pageId).execute()
  );
}

export async function deletePagePermission(pageId: string, groupId: string) {
  return firstOrNull(
    await db
      .deleteFrom("page_permissions")
      .where("page_id", "=", pageId)
      .where("group_id", "=", groupId)
      .returningAll()
      .execute()
  );
}

export async function getSiteSetting(key: string) {
  return firstOrNull(
    await db.selectFrom("site_settings").selectAll().where("key", "=", key).execute()
  );
}

export async function updateUserRole(userId: string, role: string) {
  return firstOrNull(
    await db
      .updateTable("users")
      .set({ role, updated_at: new Date() })
      .where("id", "=", userId)
      .returningAll()
      .execute()
  );
}

export async function upsertSiteSetting(key: string, value: string) {
  const now = new Date();
  return firstOrNull(
    await db
      .insertInto("site_settings")
      .values({ key, value, updated_at: now })
      .onConflict((oc) => oc.column("key").doUpdateSet({ value, updated_at: now }))
      .returningAll()
      .execute()
  );
}

export async function deleteSiteSetting(key: string) {
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
        .where("group_id", "=", groupId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (exists) continue;

      const record = await trx
        .insertInto("user_group_memberships")
        .values({
          id: `membership_${nanoid(12)}`,
          user_id: userId,
          group_id: groupId,
          added_by: null,
          created_at: now,
        })
        .returningAll()
        .executeTakeFirst();

      if (record) {
        records.push({
          id: record.id,
          userId: record.user_id,
          groupId: record.group_id,
          addedBy: record.added_by,
          createdAt: record.created_at,
        });
      }
    }

    return records;
  });
}

export async function replaceUserGroups(userId: string, groupIds: string[]): Promise<void> {
  const { nanoid } = await import("nanoid");

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("user_group_memberships").where("user_id", "=", userId).execute();
    const now = new Date();

    for (const groupId of groupIds) {
      await trx
        .insertInto("user_group_memberships")
        .values({
          id: `membership_${nanoid(12)}`,
          user_id: userId,
          group_id: groupId,
          added_by: null,
          created_at: now,
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
    await trx.deleteFrom("page_permissions").where("page_id", "=", pageId).execute();
    await trx.deleteFrom("page_inheritance").where("page_id", "=", pageId).execute();

    await trx
      .insertInto("page_inheritance")
      .values({
        id: `inherit_${nanoid(12)}`,
        page_id: pageId,
        inherit_from_parent: inheritFromParent,
        created_at: now,
      })
      .execute();

    for (const permission of permissions) {
      await trx
        .insertInto("page_permissions")
        .values({
          id: `perm_${nanoid(12)}`,
          page_id: pageId,
          group_id: permission.groupId,
          can_read: permission.canRead,
          can_write: permission.canWrite,
          can_delete: permission.canDelete,
          created_at: now,
          updated_at: now,
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
    await trx.deleteFrom("page_inheritance").where("page_id", "=", pageId).execute();
    await trx
      .insertInto("page_inheritance")
      .values({
        id: `inherit_${nanoid(12)}`,
        page_id: pageId,
        inherit_from_parent: inheritFromParent,
        created_at: new Date(),
      })
      .execute();
  });
}

export async function listSpacePermissions(spaceId: string) {
  return db.selectFrom("space_permissions").selectAll().where("space_id", "=", spaceId).execute();
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
    await trx.deleteFrom("space_permissions").where("space_id", "=", spaceId).execute();

    for (const permission of permissions) {
      await trx
        .insertInto("space_permissions")
        .values({
          id: `sp_${nanoid(12)}`,
          space_id: spaceId,
          group_id: permission.groupId,
          can_read: permission.canRead,
          can_write: permission.canWrite,
          can_delete: permission.canDelete,
          created_at: now,
          updated_at: now,
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
    .where("space_id", "=", spaceId)
    .where("group_id", "=", groupId)
    .returningAll()
    .execute();
  return result.length > 0;
}

export async function getGroupPermissionsByIds(groupIds: string[]) {
  if (groupIds.length === 0) return [];
  return db
    .selectFrom("user_groups")
    .select(["id", "permissions"])
    .where("id", "in", groupIds)
    .execute();
}
