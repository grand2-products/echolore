import {
  addGroupMembers as addGroupMembersRepo,
  getGroupById,
  listGroups,
  listMemberships,
  listMembershipsByGroup,
  listUsersForAdmin,
  listUsersWithIds,
  replaceUserGroups as replaceUserGroupsRepo,
} from "../../repositories/admin/admin-repository.js";

// Re-export repository CRUD for route layer access
export {
  createGroup,
  deleteGroup,
  deleteMembership,
  getGroupByName,
  updateGroup,
} from "../../repositories/admin/admin-repository.js";
export { getGroupById };

export async function listGroupsWithMemberCounts() {
  const [groups, memberships] = await Promise.all([listGroups(), listMemberships()]);

  return groups.map((group) => ({
    ...group,
    memberCount: memberships.filter((membership) => membership.group_id === group.id).length,
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
    members: memberships.map((membership) => membership.user_id),
  };
}

export async function listGroupMembers(groupId: string) {
  const memberships = await listMembershipsByGroup(groupId);
  const userIds = memberships.map((membership) => membership.user_id);
  if (userIds.length === 0) {
    return [];
  }

  const members = await listUsersWithIds(userIds);
  return members.map((user) => ({
    ...user,
    membership: memberships.find((membership) => membership.user_id === user.id) ?? null,
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
      .filter((membership) => membership.user_id === user.id)
      .map((membership) => groups.find((group) => group.id === membership.group_id))
      .filter((group): group is (typeof groups)[number] => Boolean(group))
      .map((group) => ({ id: group.id, name: group.name })),
  }));
}

export async function addGroupMembers(groupId: string, userIds: string[]) {
  return addGroupMembersRepo(groupId, userIds);
}

export async function replaceUserGroups(userId: string, groupIds: string[]) {
  await replaceUserGroupsRepo(userId, groupIds);
}
