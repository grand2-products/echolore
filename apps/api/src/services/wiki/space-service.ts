import { UserRole } from "@echolore/shared/contracts";
import { nanoid } from "nanoid";
import type { Space } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import { ensureRecord } from "../../lib/db-utils.js";
import {
  listGroups,
  listMembershipsByUser,
  listSpacePermissionsByGroupIds,
  listSpacePermissionsForSpace,
} from "../../repositories/admin/admin-repository.js";
import {
  createSpace,
  findGeneralSpace,
  findPersonalSpaceByUserId,
  findTeamSpaceByGroupId,
  listSpaces,
} from "../../repositories/wiki/space-repository.js";

// Re-export for route layer access
export { getSpaceById } from "../../repositories/wiki/space-repository.js";

export const GENERAL_SPACE_ID = "00000000-0000-0000-0000-000000000001";

export async function ensureGeneralSpace(): Promise<Space> {
  const now = new Date();
  return ensureRecord({
    find: () => findGeneralSpace(),
    create: () =>
      createSpace({
        id: GENERAL_SPACE_ID,
        name: "General",
        type: "general",
        owner_user_id: null,
        group_id: null,
        created_at: now,
        updated_at: now,
      }),
    errorMessage: "Failed to create general space",
  });
}

async function ensureTeamSpacesForAllGroups(): Promise<void> {
  const allGroups = await listGroups();
  if (allGroups.length === 0) return;

  const allSpaces = await listSpaces();
  const groupsWithSpaces = new Set(allSpaces.filter((s) => s.group_id).map((s) => s.group_id));

  await Promise.all(
    allGroups
      .filter((g) => !groupsWithSpaces.has(g.id))
      .map((g) => ensureTeamSpaceForGroup(g.id, g.name))
  );
}

export async function listVisibleSpaces(user: SessionUser): Promise<Space[]> {
  await Promise.all([
    ensureGeneralSpace(),
    getOrCreatePersonalSpace(user),
    ensureTeamSpacesForAllGroups(),
  ]);

  const allSpaces = await listSpaces();

  if (user.role === UserRole.Admin) {
    return allSpaces;
  }

  const memberships = await listMembershipsByUser(user.id);
  const userGroupIds = memberships.map((m) => m.group_id);
  const userGroupIdSet = new Set(userGroupIds);

  let allSpacePerms: Array<{ spaceId: string; canRead: boolean }> = [];
  if (userGroupIds.length > 0) {
    allSpacePerms = (await listSpacePermissionsByGroupIds(userGroupIds)).map((p) => ({
      spaceId: p.space_id,
      canRead: p.can_read,
    }));
  }
  const spacePermsMap = new Map<string, boolean[]>();
  for (const p of allSpacePerms) {
    const arr = spacePermsMap.get(p.spaceId);
    if (arr) {
      arr.push(p.canRead);
    } else {
      spacePermsMap.set(p.spaceId, [p.canRead]);
    }
  }

  return allSpaces.filter((space) => {
    if (space.type === "personal") return true;

    const permsForSpace = spacePermsMap.get(space.id);
    if (permsForSpace && permsForSpace.length > 0) {
      return permsForSpace.some((canRead) => canRead);
    }

    if (space.type === "general") return true;
    if (space.type === "team") return space.group_id !== null && userGroupIdSet.has(space.group_id);
    return false;
  });
}

export async function getOrCreatePersonalSpace(user: SessionUser): Promise<Space> {
  const now = new Date();
  return ensureRecord({
    find: () => findPersonalSpaceByUserId(user.id),
    create: () =>
      createSpace({
        id: `space_${nanoid(12)}`,
        name: user.name,
        type: "personal",
        owner_user_id: user.id,
        group_id: null,
        created_at: now,
        updated_at: now,
      }),
    errorMessage: "Failed to create personal space",
  });
}

export async function canAccessSpace(
  user: SessionUser,
  space: Space,
  action: "read" | "write" | "delete" = "read"
): Promise<boolean> {
  if (space.type === "personal") {
    if (action === "read") return true;
    return space.owner_user_id === user.id;
  }
  if (user.role === UserRole.Admin) return true;

  const memberships = await listMembershipsByUser(user.id);
  const groupIds = memberships.map((m) => m.group_id);

  if (groupIds.length > 0) {
    const perms = await listSpacePermissionsForSpace(space.id, groupIds);
    if (perms.length > 0) {
      return perms.some((p) => {
        if (action === "read") return p.can_read;
        if (action === "write") return p.can_write;
        return p.can_delete;
      });
    }
  }

  if (space.type === "general") return true;
  if (space.type === "team" && space.group_id) {
    return groupIds.includes(space.group_id);
  }
  return false;
}

export async function ensureTeamSpaceForGroup(groupId: string, groupName: string): Promise<Space> {
  const now = new Date();
  return ensureRecord({
    find: () => findTeamSpaceByGroupId(groupId),
    create: () =>
      createSpace({
        id: `space_${nanoid(12)}`,
        name: groupName,
        type: "team",
        owner_user_id: null,
        group_id: groupId,
        created_at: now,
        updated_at: now,
      }),
    errorMessage: "Failed to create team space",
  });
}
