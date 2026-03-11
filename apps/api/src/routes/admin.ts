import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AppEnv } from "../lib/auth.js";
import {
  createGroup,
  deleteGroup,
  deleteMembership,
  deletePagePermission,
  getGroupById,
  getGroupByName,
  getPageInheritance,
  updateGroup as updateGroupRecord,
} from "../repositories/admin/admin-repository.js";
import {
  addGroupMembers,
  createAgentDefinition,
  getGroupDetail,
  getPagePermissionsDetail,
  listAvailableAgents,
  listGroupMembers,
  listGroupsWithMemberCounts,
  listUsersWithGroups,
  replacePageInheritance,
  replacePagePermissions,
  replaceUserGroups,
  updateAgentDefinition,
} from "../services/admin/admin-service.js";

export const adminRoutes = new Hono<AppEnv>();

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
const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  systemPrompt: z.string().min(1),
  voiceProfile: z.string().nullable().optional(),
  interventionStyle: z.string().min(1),
  defaultProvider: z.enum(["google"]).default("google"),
  isActive: z.boolean().optional(),
});
const updateAgentSchema = createAgentSchema.partial();

const setPagePermissionsSchema = z.object({
  inheritFromParent: z.boolean().optional(),
  permissions: z.array(
    z.object({
      groupId: z.string(),
      canRead: z.boolean(),
      canWrite: z.boolean(),
      canDelete: z.boolean(),
    })
  ),
});

adminRoutes.get("/groups", async (c) => {
  try {
    return c.json({ groups: await listGroupsWithMemberCounts() });
  } catch (error) {
    console.error("Error fetching groups:", error);
    return c.json({ error: "Failed to fetch groups" }, 500);
  }
});

adminRoutes.get("/agents", async (c) => {
  try {
    return c.json({ agents: await listAvailableAgents() });
  } catch (error) {
    console.error("Error fetching agents:", error);
    return c.json({ error: "Failed to fetch agents" }, 500);
  }
});

adminRoutes.post("/agents", zValidator("json", createAgentSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  try {
    const agent = await createAgentDefinition({
      ...data,
      createdBy: user.id,
    });
    return c.json({ agent }, 201);
  } catch (error) {
    console.error("Error creating agent:", error);
    return c.json({ error: "Failed to create agent" }, 500);
  }
});

adminRoutes.put("/agents/:id", zValidator("json", updateAgentSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  try {
    const agent = await updateAgentDefinition(id, data);
    if (!agent) return c.json({ error: "Agent not found" }, 404);
    return c.json({ agent });
  } catch (error) {
    console.error("Error updating agent:", error);
    return c.json({ error: "Failed to update agent" }, 500);
  }
});

adminRoutes.post("/groups", zValidator("json", createGroupSchema), async (c) => {
  const data = c.req.valid("json");
  try {
    const exists = await getGroupByName(data.name);
    if (exists) return c.json({ error: "Group name already exists" }, 400);

    const now = new Date();
    const group = await createGroup({
      id: `group_${nanoid(12)}`,
      name: data.name,
      description: data.description ?? null,
      isSystem: false,
      permissions: data.permissions,
      createdAt: now,
      updatedAt: now,
    });

    return c.json({ group }, 201);
  } catch (error) {
    console.error("Error creating group:", error);
    return c.json({ error: "Failed to create group" }, 500);
  }
});

adminRoutes.get("/groups/:id", async (c) => {
  const { id } = c.req.param();
  try {
    const group = await getGroupDetail(id);
    if (!group) return c.json({ error: "Group not found" }, 404);
    return c.json({ group });
  } catch (error) {
    console.error("Error fetching group:", error);
    return c.json({ error: "Failed to fetch group" }, 500);
  }
});

adminRoutes.put("/groups/:id", zValidator("json", updateGroupSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  try {
    const group = await getGroupById(id);
    if (!group) return c.json({ error: "Group not found" }, 404);
    if (group.isSystem) return c.json({ error: "Cannot modify system groups" }, 403);

    if (data.name && data.name !== group.name) {
      const dupe = await getGroupByName(data.name);
      if (dupe) return c.json({ error: "Group name already exists" }, 400);
    }

    const updated = await updateGroupRecord(id, {
      name: data.name ?? group.name,
      description: data.description ?? group.description,
      permissions: data.permissions ?? group.permissions,
      updatedAt: new Date(),
    });

    return c.json({ group: updated });
  } catch (error) {
    console.error("Error updating group:", error);
    return c.json({ error: "Failed to update group" }, 500);
  }
});

adminRoutes.delete("/groups/:id", async (c) => {
  const { id } = c.req.param();
  try {
    const group = await getGroupById(id);
    if (!group) return c.json({ error: "Group not found" }, 404);
    if (group.isSystem) return c.json({ error: "Cannot delete system groups" }, 403);

    await deleteGroup(id);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting group:", error);
    return c.json({ error: "Failed to delete group" }, 500);
  }
});

adminRoutes.get("/groups/:id/members", async (c) => {
  const { id } = c.req.param();
  try {
    return c.json({ members: await listGroupMembers(id) });
  } catch (error) {
    console.error("Error fetching group members:", error);
    return c.json({ error: "Failed to fetch group members" }, 500);
  }
});

adminRoutes.post("/groups/:id/members", zValidator("json", addMembersSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  try {
    const inserted = await addGroupMembers(id, data.userIds);

    return c.json({ added: inserted.length, memberships: inserted });
  } catch (error) {
    console.error("Error adding members:", error);
    return c.json({ error: "Failed to add members" }, 500);
  }
});

adminRoutes.delete("/groups/:id/members/:userId", async (c) => {
  const { id, userId } = c.req.param();
  try {
    const deleted = await deleteMembership(id, userId);
    if (!deleted) return c.json({ error: "Membership not found" }, 404);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error removing member:", error);
    return c.json({ error: "Failed to remove member" }, 500);
  }
});

adminRoutes.get("/users", async (c) => {
  try {
    return c.json({ users: await listUsersWithGroups() });
  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json({ error: "Failed to fetch users" }, 500);
  }
});

adminRoutes.put("/users/:id/groups", zValidator("json", updateUserGroupsSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  try {
    await replaceUserGroups(id, data.groupIds);
    return c.json({ success: true, groupIds: data.groupIds });
  } catch (error) {
    console.error("Error updating user groups:", error);
    return c.json({ error: "Failed to update user groups" }, 500);
  }
});

adminRoutes.get("/permissions/pages/:pageId", async (c) => {
  const { pageId } = c.req.param();
  try {
    return c.json(await getPagePermissionsDetail(pageId));
  } catch (error) {
    console.error("Error fetching page permissions:", error);
    return c.json({ error: "Failed to fetch page permissions" }, 500);
  }
});

adminRoutes.put(
  "/permissions/pages/:pageId",
  zValidator("json", setPagePermissionsSchema),
  async (c) => {
    const { pageId } = c.req.param();
    const data = c.req.valid("json");
    try {
      await replacePagePermissions(pageId, data.inheritFromParent ?? true, data.permissions);

      return c.json({ pageId, inheritFromParent: data.inheritFromParent ?? true });
    } catch (error) {
      console.error("Error setting page permissions:", error);
      return c.json({ error: "Failed to set page permissions" }, 500);
    }
  }
);

adminRoutes.delete("/permissions/pages/:pageId/groups/:groupId", async (c) => {
  const { pageId, groupId } = c.req.param();
  try {
    const deleted = await deletePagePermission(pageId, groupId);
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
    const inherit = await getPageInheritance(pageId);
    return c.json({ pageId, inheritFromParent: inherit?.inheritFromParent ?? true });
  } catch (error) {
    console.error("Error fetching inheritance:", error);
    return c.json({ error: "Failed to fetch inheritance" }, 500);
  }
});

adminRoutes.put(
  "/permissions/pages/:pageId/inherit",
  zValidator("json", updateInheritanceSchema),
  async (c) => {
    const { pageId } = c.req.param();
    const data = c.req.valid("json");
    try {
      await replacePageInheritance(pageId, data.inheritFromParent);
      return c.json({ pageId, inheritFromParent: data.inheritFromParent });
    } catch (error) {
      console.error("Error setting inheritance:", error);
      return c.json({ error: "Failed to set inheritance" }, 500);
    }
  }
);
