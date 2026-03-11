import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  pageInheritance,
  pagePermissions,
  userGroupMemberships,
  userGroups,
  users,
} from "../../db/schema.js";

export async function listGroups() {
  return db.select().from(userGroups);
}

export async function getGroupById(id: string) {
  const [group] = await db.select().from(userGroups).where(eq(userGroups.id, id));
  return group ?? null;
}

export async function getGroupByName(name: string) {
  const [group] = await db.select().from(userGroups).where(eq(userGroups.name, name));
  return group ?? null;
}

export async function createGroup(input: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}) {
  const [group] = await db.insert(userGroups).values(input).returning();
  return group ?? null;
}

export async function updateGroup(
  id: string,
  input: {
    name: string;
    description: string | null;
    permissions: string[];
    updatedAt: Date;
  }
) {
  const [group] = await db.update(userGroups).set(input).where(eq(userGroups.id, id)).returning();
  return group ?? null;
}

export async function deleteGroup(id: string) {
  await db.delete(userGroupMemberships).where(eq(userGroupMemberships.groupId, id));
  await db.delete(userGroups).where(eq(userGroups.id, id));
}

export async function listMemberships() {
  return db.select().from(userGroupMemberships);
}

export async function listMembershipsByGroup(groupId: string) {
  return db.select().from(userGroupMemberships).where(eq(userGroupMemberships.groupId, groupId));
}

export async function deleteMembership(groupId: string, userId: string) {
  const [membership] = await db
    .delete(userGroupMemberships)
    .where(and(eq(userGroupMemberships.groupId, groupId), eq(userGroupMemberships.userId, userId)))
    .returning();
  return membership ?? null;
}

export async function listUsersWithIds(userIds: string[]) {
  if (userIds.length === 0) return [];
  return db.select().from(users).where(inArray(users.id, userIds));
}

export async function listUsersForAdmin() {
  return db.select().from(users);
}

export async function listPagePermissions(pageId: string) {
  return db.select().from(pagePermissions).where(eq(pagePermissions.pageId, pageId));
}

export async function getPageInheritance(pageId: string) {
  const [inheritance] = await db
    .select()
    .from(pageInheritance)
    .where(eq(pageInheritance.pageId, pageId));
  return inheritance ?? null;
}

export async function deletePagePermission(pageId: string, groupId: string) {
  const [permission] = await db
    .delete(pagePermissions)
    .where(and(eq(pagePermissions.pageId, pageId), eq(pagePermissions.groupId, groupId)))
    .returning();
  return permission ?? null;
}
