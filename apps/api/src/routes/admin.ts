import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  users,
  userGroups,
  userGroupMemberships,
  pagePermissions,
  pageInheritance,
} from "../db/schema.js";

export const adminRoutes = new Hono();

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(z.string()),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

const addMembersSchema = z.object({ userIds: z.array(z.string()).min(1) });
const updateUserGroupsSchema = z.object({ groupIds: z.array(z.string()) });
const updateInheritanceSchema = z.object({ inheritFromParent: z.boolean() });

const setPagePermissionsSchema = z.object({
  inheritFromParent: z.boolean().optional(),
  permissions: z.array(
    z.object({
      groupId: z.string(),
      canRead: z.boolean(),
      canWrite: z.boolean(),
      canDelete: z.boolean(),
    }),
  ),
});

adminRoutes.get("/groups", async (c) => {
  try {
    const [groups, memberships] = await Promise.all([
      db.select().from(userGroups),
      db.select().from(userGroupMemberships),
    ]);

    return c.json({
      groups: groups.map((group) => ({
        ...group,
        memberCount: memberships.filter((m) => m.groupId === group.id).length,
      })),
    });
  } catch (error) {
    console.error("Error fetching groups:", error);
    return c.json({ error: "Failed to fetch groups" }, 500);
  }
});

adminRoutes.post("/groups", zValidator("json", createGroupSchema), async (c) => {
  const data = c.req.valid("json");
  try {
    const [exists] = await db.select().from(userGroups).where(eq(userGroups.name, data.name));
    if (exists) return c.json({ error: "Group name already exists" }, 400);

    const now = new Date();
    const [group] = await db
      .insert(userGroups)
      .values({
        id: `group_${nanoid(12)}`,
        name: data.name,
        description: data.description ?? null,
        isSystem: false,
        permissions: data.permissions,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return c.json({ group }, 201);
  } catch (error) {
    console.error("Error creating group:", error);
    return c.json({ error: "Failed to create group" }, 500);
  }
});

adminRoutes.get("/groups/:id", async (c) => {
  const { id } = c.req.param();
  try {
    const [group] = await db.select().from(userGroups).where(eq(userGroups.id, id));
    if (!group) return c.json({ error: "Group not found" }, 404);

    const memberships = await db
      .select()
      .from(userGroupMemberships)
      .where(eq(userGroupMemberships.groupId, id));

    return c.json({ group: { ...group, members: memberships.map((m) => m.userId) } });
  } catch (error) {
    console.error("Error fetching group:", error);
    return c.json({ error: "Failed to fetch group" }, 500);
  }
});

adminRoutes.put("/groups/:id", zValidator("json", updateGroupSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  try {
    const [group] = await db.select().from(userGroups).where(eq(userGroups.id, id));
    if (!group) return c.json({ error: "Group not found" }, 404);
    if (group.isSystem) return c.json({ error: "Cannot modify system groups" }, 403);

    if (data.name && data.name !== group.name) {
      const [dupe] = await db.select().from(userGroups).where(eq(userGroups.name, data.name));
      if (dupe) return c.json({ error: "Group name already exists" }, 400);
    }

    const [updated] = await db
      .update(userGroups)
      .set({
        name: data.name ?? group.name,
        description: data.description ?? group.description,
        permissions: data.permissions ?? group.permissions,
        updatedAt: new Date(),
      })
      .where(eq(userGroups.id, id))
      .returning();

    return c.json({ group: updated });
  } catch (error) {
    console.error("Error updating group:", error);
    return c.json({ error: "Failed to update group" }, 500);
  }
});

adminRoutes.delete("/groups/:id", async (c) => {
  const { id } = c.req.param();
  try {
    const [group] = await db.select().from(userGroups).where(eq(userGroups.id, id));
    if (!group) return c.json({ error: "Group not found" }, 404);
    if (group.isSystem) return c.json({ error: "Cannot delete system groups" }, 403);

    await db.delete(userGroupMemberships).where(eq(userGroupMemberships.groupId, id));
    await db.delete(userGroups).where(eq(userGroups.id, id));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting group:", error);
    return c.json({ error: "Failed to delete group" }, 500);
  }
});

adminRoutes.get("/groups/:id/members", async (c) => {
  const { id } = c.req.param();
  try {
    const memberships = await db
      .select()
      .from(userGroupMemberships)
      .where(eq(userGroupMemberships.groupId, id));
    const userIds = memberships.map((m) => m.userId);
    if (userIds.length === 0) return c.json({ members: [] });

    const members = await db.select().from(users).where(inArray(users.id, userIds));
    return c.json({
      members: members.map((user) => ({
        ...user,
        membership: memberships.find((m) => m.userId === user.id) ?? null,
      })),
    });
  } catch (error) {
    console.error("Error fetching group members:", error);
    return c.json({ error: "Failed to fetch group members" }, 500);
  }
});

adminRoutes.post("/groups/:id/members", zValidator("json", addMembersSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  try {
    const now = new Date();
    const inserted = [];
    for (const userId of data.userIds) {
      const [exists] = await db
        .select()
        .from(userGroupMemberships)
        .where(and(eq(userGroupMemberships.groupId, id), eq(userGroupMemberships.userId, userId)));
      if (exists) continue;

      const [record] = await db
        .insert(userGroupMemberships)
        .values({ id: `membership_${nanoid(12)}`, userId, groupId: id, addedBy: null, createdAt: now })
        .returning();
      inserted.push(record);
    }

    return c.json({ added: inserted.length, memberships: inserted });
  } catch (error) {
    console.error("Error adding members:", error);
    return c.json({ error: "Failed to add members" }, 500);
  }
});

adminRoutes.delete("/groups/:id/members/:userId", async (c) => {
  const { id, userId } = c.req.param();
  try {
    const [deleted] = await db
      .delete(userGroupMemberships)
      .where(and(eq(userGroupMemberships.groupId, id), eq(userGroupMemberships.userId, userId)))
      .returning();
    if (!deleted) return c.json({ error: "Membership not found" }, 404);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error removing member:", error);
    return c.json({ error: "Failed to remove member" }, 500);
  }
});

adminRoutes.get("/users", async (c) => {
  try {
    const [allUsers, groups, memberships] = await Promise.all([
      db.select().from(users),
      db.select().from(userGroups),
      db.select().from(userGroupMemberships),
    ]);

    return c.json({
      users: allUsers.map((user) => ({
        ...user,
        groups: memberships
          .filter((m) => m.userId === user.id)
          .map((m) => groups.find((g) => g.id === m.groupId))
          .filter((g): g is (typeof groups)[number] => Boolean(g))
          .map((g) => ({ id: g.id, name: g.name })),
      })),
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json({ error: "Failed to fetch users" }, 500);
  }
});

adminRoutes.put("/users/:id/groups", zValidator("json", updateUserGroupsSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  try {
    await db.delete(userGroupMemberships).where(eq(userGroupMemberships.userId, id));
    const now = new Date();
    for (const groupId of data.groupIds) {
      await db.insert(userGroupMemberships).values({
        id: `membership_${nanoid(12)}`,
        userId: id,
        groupId,
        addedBy: null,
        createdAt: now,
      });
    }
    return c.json({ success: true, groupIds: data.groupIds });
  } catch (error) {
    console.error("Error updating user groups:", error);
    return c.json({ error: "Failed to update user groups" }, 500);
  }
});

adminRoutes.get("/permissions/pages/:pageId", async (c) => {
  const { pageId } = c.req.param();
  try {
    const [perms, groups, inherit] = await Promise.all([
      db.select().from(pagePermissions).where(eq(pagePermissions.pageId, pageId)),
      db.select().from(userGroups),
      db.select().from(pageInheritance).where(eq(pageInheritance.pageId, pageId)),
    ]);

    return c.json({
      pageId,
      inheritFromParent: inherit[0]?.inheritFromParent ?? true,
      permissions: perms.map((p) => ({
        ...p,
        group: groups.find((g) => g.id === p.groupId) ?? null,
      })),
    });
  } catch (error) {
    console.error("Error fetching page permissions:", error);
    return c.json({ error: "Failed to fetch page permissions" }, 500);
  }
});

adminRoutes.put("/permissions/pages/:pageId", zValidator("json", setPagePermissionsSchema), async (c) => {
  const { pageId } = c.req.param();
  const data = c.req.valid("json");
  try {
    const now = new Date();
    await db.delete(pagePermissions).where(eq(pagePermissions.pageId, pageId));
    await db.delete(pageInheritance).where(eq(pageInheritance.pageId, pageId));

    await db.insert(pageInheritance).values({
      id: `inherit_${nanoid(12)}`,
      pageId,
      inheritFromParent: data.inheritFromParent ?? true,
      createdAt: now,
    });

    for (const perm of data.permissions) {
      await db.insert(pagePermissions).values({
        id: `perm_${nanoid(12)}`,
        pageId,
        groupId: perm.groupId,
        canRead: perm.canRead,
        canWrite: perm.canWrite,
        canDelete: perm.canDelete,
        createdAt: now,
        updatedAt: now,
      });
    }

    return c.json({ pageId, inheritFromParent: data.inheritFromParent ?? true });
  } catch (error) {
    console.error("Error setting page permissions:", error);
    return c.json({ error: "Failed to set page permissions" }, 500);
  }
});

adminRoutes.delete("/permissions/pages/:pageId/groups/:groupId", async (c) => {
  const { pageId, groupId } = c.req.param();
  try {
    const [deleted] = await db
      .delete(pagePermissions)
      .where(and(eq(pagePermissions.pageId, pageId), eq(pagePermissions.groupId, groupId)))
      .returning();
    if (!deleted) return c.json({ error: "Permission not found" }, 404);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error removing permission:", error);
    return c.json({ error: "Failed to remove permission" }, 500);
  }
});

adminRoutes.get("/permissions/pages/:pageId/inherit", async (c) => {
  const { pageId } = c.req.param();
  try {
    const [inherit] = await db.select().from(pageInheritance).where(eq(pageInheritance.pageId, pageId));
    return c.json({ pageId, inheritFromParent: inherit?.inheritFromParent ?? true });
  } catch (error) {
    console.error("Error fetching inheritance:", error);
    return c.json({ error: "Failed to fetch inheritance" }, 500);
  }
});

adminRoutes.put("/permissions/pages/:pageId/inherit", zValidator("json", updateInheritanceSchema), async (c) => {
  const { pageId } = c.req.param();
  const data = c.req.valid("json");
  try {
    await db.delete(pageInheritance).where(eq(pageInheritance.pageId, pageId));
    await db.insert(pageInheritance).values({
      id: `inherit_${nanoid(12)}`,
      pageId,
      inheritFromParent: data.inheritFromParent,
      createdAt: new Date(),
    });
    return c.json({ pageId, inheritFromParent: data.inheritFromParent });
  } catch (error) {
    console.error("Error setting inheritance:", error);
    return c.json({ error: "Failed to set inheritance" }, 500);
  }
});
