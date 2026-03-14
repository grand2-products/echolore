import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import { userGroupMemberships } from "../../db/schema.js";
import {
  getGroupById,
  listGroups,
  listMemberships,
  listMembershipsByGroup,
  listUsersForAdmin,
  listUsersWithIds,
} from "../../repositories/admin/admin-repository.js";

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
