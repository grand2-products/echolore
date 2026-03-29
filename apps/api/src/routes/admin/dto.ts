import type {
  AdminGroupDetailDto,
  AdminGroupDto,
  AdminSpacePermissionRecordDto,
  AdminSpacePermissionsResponseDto,
  AdminUserGroupRefDto,
  AdminUserRecordDto,
} from "@echolore/shared/contracts";
import { resolveUserAvatarUrl } from "../user-dto.js";

type AdminGroupRaw = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
  created_at: Date;
  updated_at: Date;
  memberCount?: number;
};

type AdminGroupDetailRaw = Omit<AdminGroupRaw, "memberCount"> & {
  members: string[];
};

type AdminUserRaw = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  suspended_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  groups: Array<{ id: string; name: string }>;
};

type AdminSpacePermissionRaw = {
  id: string;
  space_id: string;
  group_id: string;
  groupName?: string;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
  created_at: Date;
  updated_at: Date;
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
  isSystem: group.is_system,
  permissions: group.permissions,
  createdAt: group.created_at.toISOString(),
  updatedAt: group.updated_at.toISOString(),
  memberCount: group.memberCount ?? 0,
});

export const toAdminGroupDetailDto = (group: AdminGroupDetailRaw): AdminGroupDetailDto => ({
  id: group.id,
  name: group.name,
  description: group.description,
  isSystem: group.is_system,
  permissions: group.permissions,
  createdAt: group.created_at.toISOString(),
  updatedAt: group.updated_at.toISOString(),
  members: group.members,
});

export const toAdminUserRecordDto = (user: AdminUserRaw): AdminUserRecordDto => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarUrl: resolveUserAvatarUrl(user),
  role: user.role === "admin" ? "admin" : "member",
  suspendedAt: user.suspended_at?.toISOString() ?? null,
  deletedAt: user.deleted_at?.toISOString() ?? null,
  createdAt: user.created_at.toISOString(),
  updatedAt: user.updated_at.toISOString(),
  groups: user.groups.map(toAdminUserGroupRefDto),
});

export const toAdminSpacePermissionRecordDto = (
  permission: AdminSpacePermissionRaw
): AdminSpacePermissionRecordDto => ({
  id: permission.id,
  spaceId: permission.space_id,
  groupId: permission.group_id,
  groupName: permission.groupName,
  canRead: permission.can_read,
  canWrite: permission.can_write,
  canDelete: permission.can_delete,
  createdAt: permission.created_at.toISOString(),
  updatedAt: permission.updated_at.toISOString(),
});

export const toAdminSpacePermissionsResponseDto = (input: {
  spaceId: string;
  permissions: AdminSpacePermissionRaw[];
}): AdminSpacePermissionsResponseDto => ({
  spaceId: input.spaceId,
  permissions: input.permissions.map(toAdminSpacePermissionRecordDto),
});
