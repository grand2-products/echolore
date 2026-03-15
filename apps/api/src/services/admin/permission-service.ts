import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import { pageInheritance, pagePermissions, spacePermissions } from "../../db/schema.js";
import {
  getPageInheritance,
  listGroups,
  listPagePermissions,
} from "../../repositories/admin/admin-repository.js";

export async function getPagePermissionsDetail(pageId: string) {
  const [permissions, groups, inheritance] = await Promise.all([
    listPagePermissions(pageId),
    listGroups(),
    getPageInheritance(pageId),
  ]);

  return {
    pageId,
    inheritFromParent: inheritance?.inheritFromParent ?? true,
    permissions: permissions.map((permission) => ({
      ...permission,
      group: groups.find((group) => group.id === permission.groupId) ?? null,
    })),
  };
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
) {
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

export async function replacePageInheritance(pageId: string, inheritFromParent: boolean) {
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

export async function getSpacePermissionsDetail(spaceId: string) {
  const [permissions, groups] = await Promise.all([
    db.select().from(spacePermissions).where(eq(spacePermissions.spaceId, spaceId)),
    listGroups(),
  ]);

  return {
    spaceId,
    permissions: permissions.map((permission) => ({
      ...permission,
      groupName: groups.find((group) => group.id === permission.groupId)?.name ?? undefined,
    })),
  };
}

export async function replaceSpacePermissions(
  spaceId: string,
  permissions: Array<{
    groupId: string;
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
  }>
) {
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

export async function deleteSpacePermissionForGroup(spaceId: string, groupId: string) {
  const result = await db
    .delete(spacePermissions)
    .where(and(eq(spacePermissions.spaceId, spaceId), eq(spacePermissions.groupId, groupId)))
    .returning();
  return result.length > 0;
}
