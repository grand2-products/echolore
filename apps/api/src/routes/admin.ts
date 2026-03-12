import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { jsonError } from "../lib/api-error.js";
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
    return jsonError(c, 500, "ADMIN_GROUPS_LIST_FAILED", "Failed to fetch groups");
  }
});

adminRoutes.get("/agents", async (c) => {
  try {
    return c.json({ agents: await listAvailableAgents() });
  } catch (error) {
    console.error("Error fetching agents:", error);
    return jsonError(c, 500, "ADMIN_AGENTS_LIST_FAILED", "Failed to fetch agents");
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
    return jsonError(c, 500, "ADMIN_AGENT_CREATE_FAILED", "Failed to create agent");
  }
});

adminRoutes.put("/agents/:id", zValidator("json", updateAgentSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  try {
    const agent = await updateAgentDefinition(id, data);
    if (!agent) return jsonError(c, 404, "ADMIN_AGENT_NOT_FOUND", "Agent not found");
    return c.json({ agent });
  } catch (error) {
    console.error("Error updating agent:", error);
    return jsonError(c, 500, "ADMIN_AGENT_UPDATE_FAILED", "Failed to update agent");
  }
});

adminRoutes.post("/groups", zValidator("json", createGroupSchema), async (c) => {
  const data = c.req.valid("json");
  try {
    const exists = await getGroupByName(data.name);
    if (exists) {
      return jsonError(c, 400, "ADMIN_GROUP_NAME_CONFLICT", "Group name already exists");
    }

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
    return jsonError(c, 500, "ADMIN_GROUP_CREATE_FAILED", "Failed to create group");
  }
});

adminRoutes.get("/groups/:id", async (c) => {
  const { id } = c.req.param();
  try {
    const group = await getGroupDetail(id);
    if (!group) return jsonError(c, 404, "ADMIN_GROUP_NOT_FOUND", "Group not found");
    return c.json({ group });
  } catch (error) {
    console.error("Error fetching group:", error);
    return jsonError(c, 500, "ADMIN_GROUP_FETCH_FAILED", "Failed to fetch group");
  }
});

adminRoutes.put("/groups/:id", zValidator("json", updateGroupSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  try {
    const group = await getGroupById(id);
    if (!group) return jsonError(c, 404, "ADMIN_GROUP_NOT_FOUND", "Group not found");
    if (group.isSystem) {
      return jsonError(c, 403, "ADMIN_GROUP_SYSTEM_MUTATION_FORBIDDEN", "Cannot modify system groups");
    }

    if (data.name && data.name !== group.name) {
      const dupe = await getGroupByName(data.name);
      if (dupe) {
        return jsonError(c, 400, "ADMIN_GROUP_NAME_CONFLICT", "Group name already exists");
      }
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
    return jsonError(c, 500, "ADMIN_GROUP_UPDATE_FAILED", "Failed to update group");
  }
});

adminRoutes.delete("/groups/:id", async (c) => {
  const { id } = c.req.param();
  try {
    const group = await getGroupById(id);
    if (!group) return jsonError(c, 404, "ADMIN_GROUP_NOT_FOUND", "Group not found");
    if (group.isSystem) {
      return jsonError(c, 403, "ADMIN_GROUP_SYSTEM_DELETE_FORBIDDEN", "Cannot delete system groups");
    }

    await deleteGroup(id);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting group:", error);
    return jsonError(c, 500, "ADMIN_GROUP_DELETE_FAILED", "Failed to delete group");
  }
});

adminRoutes.get("/groups/:id/members", async (c) => {
  const { id } = c.req.param();
  try {
    return c.json({ members: await listGroupMembers(id) });
  } catch (error) {
    console.error("Error fetching group members:", error);
    return jsonError(c, 500, "ADMIN_GROUP_MEMBERS_LIST_FAILED", "Failed to fetch group members");
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
    return jsonError(c, 500, "ADMIN_GROUP_MEMBERS_ADD_FAILED", "Failed to add members");
  }
});

adminRoutes.delete("/groups/:id/members/:userId", async (c) => {
  const { id, userId } = c.req.param();
  try {
    const deleted = await deleteMembership(id, userId);
    if (!deleted) {
      return jsonError(c, 404, "ADMIN_MEMBERSHIP_NOT_FOUND", "Membership not found");
    }
    return c.json({ success: true });
  } catch (error) {
    console.error("Error removing member:", error);
    return jsonError(c, 500, "ADMIN_MEMBERSHIP_DELETE_FAILED", "Failed to remove member");
  }
});

adminRoutes.get("/users", async (c) => {
  try {
    return c.json({ users: await listUsersWithGroups() });
  } catch (error) {
    console.error("Error fetching users:", error);
    return jsonError(c, 500, "ADMIN_USERS_LIST_FAILED", "Failed to fetch users");
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
    return jsonError(c, 500, "ADMIN_USER_GROUPS_UPDATE_FAILED", "Failed to update user groups");
  }
});

adminRoutes.get("/permissions/pages/:pageId", async (c) => {
  const { pageId } = c.req.param();
  try {
    return c.json(await getPagePermissionsDetail(pageId));
  } catch (error) {
    console.error("Error fetching page permissions:", error);
    return jsonError(c, 500, "ADMIN_PAGE_PERMISSIONS_FETCH_FAILED", "Failed to fetch page permissions");
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
      return jsonError(c, 500, "ADMIN_PAGE_PERMISSIONS_SET_FAILED", "Failed to set page permissions");
    }
  }
);

adminRoutes.delete("/permissions/pages/:pageId/groups/:groupId", async (c) => {
  const { pageId, groupId } = c.req.param();
  try {
    const deleted = await deletePagePermission(pageId, groupId);
    if (!deleted) {
      return jsonError(c, 404, "ADMIN_PAGE_PERMISSION_NOT_FOUND", "Permission not found");
    }
    return c.json({ success: true });
  } catch (error) {
    console.error("Error removing permission:", error);
    return jsonError(c, 500, "ADMIN_PAGE_PERMISSION_DELETE_FAILED", "Failed to remove permission");
  }
});

adminRoutes.get("/permissions/pages/:pageId/inherit", async (c) => {
  const { pageId } = c.req.param();
  try {
    const inherit = await getPageInheritance(pageId);
    return c.json({ pageId, inheritFromParent: inherit?.inheritFromParent ?? true });
  } catch (error) {
    console.error("Error fetching inheritance:", error);
    return jsonError(c, 500, "ADMIN_PAGE_INHERITANCE_FETCH_FAILED", "Failed to fetch inheritance");
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
      return jsonError(c, 500, "ADMIN_PAGE_INHERITANCE_SET_FAILED", "Failed to set inheritance");
    }
  }
);
