import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { UserRole } from "@corp-internal/shared/contracts";
import { db } from "../../db/index.js";
import { userGroupMemberships, type Space } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import {
  createSpace,
  getGeneralSpace,
  getPersonalSpaceByUserId,
  getTeamSpaceByGroupId,
  listSpaces,
} from "../../repositories/wiki/space-repository.js";

export const GENERAL_SPACE_ID = "00000000-0000-0000-0000-000000000001";

export async function ensureGeneralSpace(): Promise<Space> {
  const existing = await getGeneralSpace();
  if (existing) return existing;

  const now = new Date();
  try {
    const space = await createSpace({
      id: GENERAL_SPACE_ID,
      name: "General",
      type: "general",
      ownerUserId: null,
      groupId: null,
      createdAt: now,
      updatedAt: now,
    });

    if (!space) {
      throw new Error("Failed to create general space");
    }

    return space;
  } catch {
    // Race condition: another request may have created it concurrently
    const retry = await getGeneralSpace();
    if (retry) return retry;
    throw new Error("Failed to create general space");
  }
}

export async function listVisibleSpaces(user: SessionUser): Promise<Space[]> {
  // Ensure the general space and user's personal space exist (lazy creation)
  await Promise.all([ensureGeneralSpace(), getOrCreatePersonalSpace(user)]);

  const allSpaces = await listSpaces();

  if (user.role === UserRole.Admin) {
    return allSpaces;
  }

  // Get user's group memberships
  const memberships = await db
    .select({ groupId: userGroupMemberships.groupId })
    .from(userGroupMemberships)
    .where(eq(userGroupMemberships.userId, user.id));
  const userGroupIds = new Set(memberships.map((m) => m.groupId));

  return allSpaces.filter((space) => {
    if (space.type === "general") return true;
    if (space.type === "personal") return space.ownerUserId === user.id;
    if (space.type === "team") return space.groupId !== null && userGroupIds.has(space.groupId);
    return false;
  });
}

export async function getOrCreatePersonalSpace(user: SessionUser): Promise<Space> {
  const existing = await getPersonalSpaceByUserId(user.id);
  if (existing) return existing;

  const now = new Date();
  try {
    const space = await createSpace({
      id: `space_${nanoid(12)}`,
      name: user.name,
      type: "personal",
      ownerUserId: user.id,
      groupId: null,
      createdAt: now,
      updatedAt: now,
    });

    if (!space) {
      throw new Error("Failed to create personal space");
    }

    return space;
  } catch {
    // Race condition: another request may have created it concurrently
    const retry = await getPersonalSpaceByUserId(user.id);
    if (retry) return retry;
    throw new Error("Failed to create personal space");
  }
}

export async function canAccessSpace(user: SessionUser, space: Space): Promise<boolean> {
  if (user.role === UserRole.Admin) return true;
  if (space.type === "general") return true;
  if (space.type === "personal") return space.ownerUserId === user.id;
  if (space.type === "team" && space.groupId) {
    const memberships = await db
      .select({ groupId: userGroupMemberships.groupId })
      .from(userGroupMemberships)
      .where(eq(userGroupMemberships.userId, user.id));
    return memberships.some((m) => m.groupId === space.groupId);
  }
  return false;
}

export async function ensureTeamSpaceForGroup(groupId: string, groupName: string): Promise<Space> {
  const existing = await getTeamSpaceByGroupId(groupId);
  if (existing) return existing;

  const now = new Date();
  try {
    const space = await createSpace({
      id: `space_${nanoid(12)}`,
      name: groupName,
      type: "team",
      ownerUserId: null,
      groupId,
      createdAt: now,
      updatedAt: now,
    });

    if (!space) {
      throw new Error("Failed to create team space");
    }

    return space;
  } catch {
    // Race condition: another request may have created it concurrently
    const retry = await getTeamSpaceByGroupId(groupId);
    if (retry) return retry;
    throw new Error("Failed to create team space");
  }
}
