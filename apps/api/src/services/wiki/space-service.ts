import { UserRole } from "@echolore/shared/contracts";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import { type Space, spacePermissions, userGroupMemberships, userGroups } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import { ensureRecord } from "../../lib/db-utils.js";
import {
  createSpace,
  getGeneralSpace,
  getPersonalSpaceByUserId,
  getTeamSpaceByGroupId,
  listSpaces,
} from "../../repositories/wiki/space-repository.js";

export const GENERAL_SPACE_ID = "00000000-0000-0000-0000-000000000001";

export async function ensureGeneralSpace(): Promise<Space> {
  const now = new Date();
  return ensureRecord({
    find: () => getGeneralSpace(),
    create: () =>
      createSpace({
        id: GENERAL_SPACE_ID,
        name: "General",
        type: "general",
        ownerUserId: null,
        groupId: null,
        createdAt: now,
        updatedAt: now,
      }),
    errorMessage: "Failed to create general space",
  });
}

async function ensureTeamSpacesForAllGroups(): Promise<void> {
  const allGroups = await db.select({ id: userGroups.id, name: userGroups.name }).from(userGroups);
  if (allGroups.length === 0) return;

  const allSpaces = await listSpaces();
  const groupsWithSpaces = new Set(allSpaces.filter((s) => s.groupId).map((s) => s.groupId));

  await Promise.all(
    allGroups
      .filter((g) => !groupsWithSpaces.has(g.id))
      .map((g) => ensureTeamSpaceForGroup(g.id, g.name))
  );
}

export async function listVisibleSpaces(user: SessionUser): Promise<Space[]> {
  // Ensure the general space, user's personal space, and all group team spaces exist
  await Promise.all([
    ensureGeneralSpace(),
    getOrCreatePersonalSpace(user),
    ensureTeamSpacesForAllGroups(),
  ]);

  const allSpaces = await listSpaces();

  if (user.role === UserRole.Admin) {
    return allSpaces;
  }

  // Get user's group memberships
  const memberships = await db
    .select({ groupId: userGroupMemberships.groupId })
    .from(userGroupMemberships)
    .where(eq(userGroupMemberships.userId, user.id));
  const userGroupIds = memberships.map((m) => m.groupId);
  const userGroupIdSet = new Set(userGroupIds);

  // Batch-fetch all space permissions for the user's groups to avoid N+1
  let allSpacePerms: Array<{ spaceId: string; canRead: boolean }> = [];
  if (userGroupIds.length > 0) {
    allSpacePerms = await db
      .select({ spaceId: spacePermissions.spaceId, canRead: spacePermissions.canRead })
      .from(spacePermissions)
      .where(inArray(spacePermissions.groupId, userGroupIds));
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
    if (space.type === "personal") return space.ownerUserId === user.id;

    // If space permissions exist for any of the user's groups, use them
    const permsForSpace = spacePermsMap.get(space.id);
    if (permsForSpace && permsForSpace.length > 0) {
      return permsForSpace.some((canRead) => canRead);
    }

    // Fallback to legacy visibility rules
    if (space.type === "general") return true;
    if (space.type === "team") return space.groupId !== null && userGroupIdSet.has(space.groupId);
    return false;
  });
}

export async function getOrCreatePersonalSpace(user: SessionUser): Promise<Space> {
  const now = new Date();
  return ensureRecord({
    find: () => getPersonalSpaceByUserId(user.id),
    create: () =>
      createSpace({
        id: `space_${nanoid(12)}`,
        name: user.name,
        type: "personal",
        ownerUserId: user.id,
        groupId: null,
        createdAt: now,
        updatedAt: now,
      }),
    errorMessage: "Failed to create personal space",
  });
}

export async function canAccessSpace(
  user: SessionUser,
  space: Space,
  action: "read" | "write" | "delete" = "read"
): Promise<boolean> {
  if (user.role === UserRole.Admin) return true;
  if (space.type === "personal") return space.ownerUserId === user.id;

  const memberships = await db
    .select({ groupId: userGroupMemberships.groupId })
    .from(userGroupMemberships)
    .where(eq(userGroupMemberships.userId, user.id));
  const groupIds = memberships.map((m) => m.groupId);

  // Check space permissions if any are defined for the user's groups
  if (groupIds.length > 0) {
    const perms = await db
      .select()
      .from(spacePermissions)
      .where(
        and(eq(spacePermissions.spaceId, space.id), inArray(spacePermissions.groupId, groupIds))
      );
    if (perms.length > 0) {
      return perms.some((p) => {
        if (action === "read") return p.canRead;
        if (action === "write") return p.canWrite;
        return p.canDelete;
      });
    }
  }

  // Fallback to legacy visibility rules when no space permissions are set
  if (space.type === "general") return true;
  if (space.type === "team" && space.groupId) {
    return groupIds.includes(space.groupId);
  }
  return false;
}

export async function ensureTeamSpaceForGroup(groupId: string, groupName: string): Promise<Space> {
  const now = new Date();
  return ensureRecord({
    find: () => getTeamSpaceByGroupId(groupId),
    create: () =>
      createSpace({
        id: `space_${nanoid(12)}`,
        name: groupName,
        type: "team",
        ownerUserId: null,
        groupId,
        createdAt: now,
        updatedAt: now,
      }),
    errorMessage: "Failed to create team space",
  });
}
