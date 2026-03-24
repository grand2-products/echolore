import type {
  AdminGroupDetailDto,
  AdminGroupDto,
  AdminSpacePermissionRecordDto,
  AdminSpacePermissionsResponseDto,
  AdminUserGroupRefDto,
  AdminUserRecordDto,
} from "@echolore/shared/contracts";

type AdminGroupRaw = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
  memberCount?: number;
};

type AdminGroupDetailRaw = Omit<AdminGroupRaw, "memberCount"> & {
  members: string[];
};

type AdminUserRaw = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  suspendedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  groups: Array<{ id: string; name: string }>;
};

type AdminSpacePermissionRaw = {
  id: string;
  spaceId: string;
  groupId: string;
  groupName?: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const toAdminUserGroupRefDto = (group: {
  id: string;
  name: string;
}): AdminUserGroupRefDto => ({
  id: group.id,
  name: group.name,
});

export const toAdminGroupDto = (group: AdminGroupRaw): AdminGroupDto => ({
  id: group.id,
  name: group.name,
  description: group.description,
  isSystem: group.isSystem,
  permissions: group.permissions,
  createdAt: group.createdAt.toISOString(),
  updatedAt: group.updatedAt.toISOString(),
  memberCount: group.memberCount ?? 0,
});

export const toAdminGroupDetailDto = (group: AdminGroupDetailRaw): AdminGroupDetailDto => ({
  id: group.id,
  name: group.name,
  description: group.description,
  isSystem: group.isSystem,
  permissions: group.permissions,
  createdAt: group.createdAt.toISOString(),
  updatedAt: group.updatedAt.toISOString(),
  members: group.members,
});

export const toAdminUserRecordDto = (user: AdminUserRaw): AdminUserRecordDto => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatarUrl,
  role: user.role === "admin" ? "admin" : "member",
  suspendedAt: user.suspendedAt?.toISOString() ?? null,
  deletedAt: user.deletedAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
  groups: user.groups.map(toAdminUserGroupRefDto),
});

export const toAdminSpacePermissionRecordDto = (
  permission: AdminSpacePermissionRaw
): AdminSpacePermissionRecordDto => ({
  id: permission.id,
  spaceId: permission.spaceId,
  groupId: permission.groupId,
  groupName: permission.groupName,
  canRead: permission.canRead,
  canWrite: permission.canWrite,
  canDelete: permission.canDelete,
  createdAt: permission.createdAt.toISOString(),
  updatedAt: permission.updatedAt.toISOString(),
});

export const toAdminSpacePermissionsResponseDto = (input: {
  spaceId: string;
  permissions: AdminSpacePermissionRaw[];
}): AdminSpacePermissionsResponseDto => ({
  spaceId: input.spaceId,
  permissions: input.permissions.map(toAdminSpacePermissionRecordDto),
});
