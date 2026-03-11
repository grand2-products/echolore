import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import { pageInheritance, pagePermissions, userGroupMemberships } from "../../db/schema.js";
import {
  getGroupById,
  getPageInheritance,
  listGroups,
  listMemberships,
  listMembershipsByGroup,
  listPagePermissions,
  listUsersForAdmin,
  listUsersWithIds,
} from "../../repositories/admin/admin-repository.js";
import {
  createAgent,
  getAgentById,
  listActiveAgents,
  updateAgent,
} from "../../repositories/meeting/meeting-realtime-repository.js";

export async function listGroupsWithMemberCounts() {
  const [groups, memberships] = await Promise.all([listGroups(), listMemberships()]);

  return groups.map((group) => ({
    ...group,
    memberCount: memberships.filter((membership) => membership.groupId === group.id).length,
  }));
}

export async function getGroupDetail(groupId: string) {
  const group = await getGroupById(groupId);
  if (!group) {
    return null;
  }

  const memberships = await listMembershipsByGroup(groupId);
  return {
    ...group,
    members: memberships.map((membership) => membership.userId),
  };
}

export async function listGroupMembers(groupId: string) {
  const memberships = await listMembershipsByGroup(groupId);
  const userIds = memberships.map((membership) => membership.userId);
  if (userIds.length === 0) {
    return [];
  }

  const members = await listUsersWithIds(userIds);
  return members.map((user) => ({
    ...user,
    membership: memberships.find((membership) => membership.userId === user.id) ?? null,
  }));
}

export async function listUsersWithGroups() {
  const [users, groups, memberships] = await Promise.all([
    listUsersForAdmin(),
    listGroups(),
    listMemberships(),
  ]);

  return users.map((user) => ({
    ...user,
    groups: memberships
      .filter((membership) => membership.userId === user.id)
      .map((membership) => groups.find((group) => group.id === membership.groupId))
      .filter((group): group is (typeof groups)[number] => Boolean(group))
      .map((group) => ({ id: group.id, name: group.name })),
  }));
}

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

export async function listAvailableAgents() {
  return listActiveAgents();
}

export async function createAgentDefinition(input: {
  name: string;
  description?: string | null;
  systemPrompt: string;
  voiceProfile?: string | null;
  interventionStyle: string;
  defaultProvider: string;
  isActive?: boolean;
  createdBy: string;
}) {
  const now = new Date();
  return createAgent({
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description ?? null,
    systemPrompt: input.systemPrompt,
    voiceProfile: input.voiceProfile ?? null,
    interventionStyle: input.interventionStyle,
    defaultProvider: input.defaultProvider,
    isActive: input.isActive ?? true,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateAgentDefinition(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    systemPrompt?: string;
    voiceProfile?: string | null;
    interventionStyle?: string;
    defaultProvider?: string;
    isActive?: boolean;
  }
) {
  const agent = await getAgentById(id);
  if (!agent) {
    return null;
  }

  return updateAgent(id, {
    ...input,
    updatedAt: new Date(),
  });
}

export async function addGroupMembers(groupId: string, userIds: string[]) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const records = [];
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

export async function replaceUserGroups(userId: string, groupIds: string[]) {
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
