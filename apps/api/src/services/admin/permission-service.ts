import {
  deleteSpacePermissionForGroup as deleteSpacePermissionForGroupRepo,
  getPageInheritance,
  listGroups,
  listPagePermissions,
  listSpacePermissions,
  replacePageInheritance as replacePageInheritanceRepo,
  replacePagePermissions as replacePagePermissionsRepo,
  replaceSpacePermissions as replaceSpacePermissionsRepo,
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
  await replacePagePermissionsRepo(pageId, inheritFromParent, permissions);
}

export async function replacePageInheritance(pageId: string, inheritFromParent: boolean) {
  await replacePageInheritanceRepo(pageId, inheritFromParent);
}

export async function getSpacePermissionsDetail(spaceId: string) {
  const [permissions, groups] = await Promise.all([listSpacePermissions(spaceId), listGroups()]);

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
  await replaceSpacePermissionsRepo(spaceId, permissions);
}

export async function deleteSpacePermissionForGroup(spaceId: string, groupId: string) {
  return deleteSpacePermissionForGroupRepo(spaceId, groupId);
}
