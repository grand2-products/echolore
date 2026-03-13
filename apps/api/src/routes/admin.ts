import { zValidator } from "@hono/zod-validator";
import { ALL_GROUP_PERMISSIONS, type GroupPermission, UserRole } from "@corp-internal/shared/contracts";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createChatModel, isTextGenerationEnabled, resolveTextProvider } from "../ai/llm/index.js";
import type { LlmOverrides } from "../ai/llm/index.js";
import { jsonError } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import { createStorageProvider, removeFile, saveFile, setStorageProvider } from "../lib/file-storage.js";
import {
  createGroup,
  deleteGroup,
  deleteMembership,
  deleteSiteSetting,
  deletePagePermission,
  getGroupById,
  getGroupByName,
  getPageInheritance,
  upsertSiteSetting,
  updateGroup as updateGroupRecord,
} from "../repositories/admin/admin-repository.js";
import {
  addGroupMembers,
  changeUserRole,
  createAgentDefinition,
  getGroupDetail,
  getPagePermissionsDetail,
  getEmailSettings,
  getLlmSettings,
  getSiteSettings,
  listAvailableAgents,
  listGroupMembers,
  listGroupsWithMemberCounts,
  listUsersWithGroups,
  replacePageInheritance,
  replacePagePermissions,
  replaceUserGroups,
  updateAgentDefinition,
  getStorageSettings,
  updateEmailSettings,
  updateLlmSettings,
  updateSiteSettings,
  updateStorageSettings,
} from "../services/admin/admin-service.js";
import { ensureTeamSpaceForGroup } from "../services/wiki/space-service.js";

export const adminRoutes = new Hono<AppEnv>();

const groupPermissionSchema = z.enum(
  ALL_GROUP_PERMISSIONS as [GroupPermission, ...GroupPermission[]]
);

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(groupPermissionSchema),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  permissions: z.array(groupPermissionSchema).optional(),
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
  defaultProvider: z.enum(["google", "vertex", "zhipu"]).default("google"),
  isActive: z.boolean().optional(),
  autonomousEnabled: z.boolean().optional(),
  autonomousCooldownSec: z.number().int().min(10).max(3600).optional(),
});
const updateAgentSchema = createAgentSchema.partial();

const updateUserRoleSchema = z.object({ role: z.enum([UserRole.Admin, UserRole.Member]) });

const updateSiteSettingsSchema = z.object({
  siteTitle: z.string().max(200).optional(),
  siteTagline: z.string().max(500).optional(),
  livekitMeetingSimulcast: z.boolean().optional(),
  livekitMeetingDynacast: z.boolean().optional(),
  livekitMeetingAdaptiveStream: z.boolean().optional(),
  livekitCoworkingSimulcast: z.boolean().optional(),
  livekitCoworkingDynacast: z.boolean().optional(),
  livekitCoworkingAdaptiveStream: z.boolean().optional(),
});

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
    const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const all = await listGroupsWithMemberCounts();
    return c.json({ groups: all.slice(offset, offset + limit), total: all.length });
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

    if (group) {
      // Auto-create a team space for the new group
      await ensureTeamSpaceForGroup(group.id, group.name);
    }

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
    const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const all = await listUsersWithGroups();
    return c.json({ users: all.slice(offset, offset + limit), total: all.length });
  } catch (error) {
    console.error("Error fetching users:", error);
    return jsonError(c, 500, "ADMIN_USERS_LIST_FAILED", "Failed to fetch users");
  }
});

adminRoutes.put("/users/:id/role", zValidator("json", updateUserRoleSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  try {
    const user = await changeUserRole(id, data.role);
    if (!user) return jsonError(c, 404, "ADMIN_USER_NOT_FOUND", "User not found");
    return c.json({ user });
  } catch (error) {
    console.error("Error updating user role:", error);
    return jsonError(c, 500, "ADMIN_USER_ROLE_UPDATE_FAILED", "Failed to update user role");
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

adminRoutes.get("/settings", async (c) => {
  try {
    return c.json(await getSiteSettings());
  } catch (error) {
    console.error("Error fetching site settings:", error);
    return jsonError(c, 500, "ADMIN_SETTINGS_FETCH_FAILED", "Failed to fetch site settings");
  }
});

adminRoutes.put("/settings", zValidator("json", updateSiteSettingsSchema), async (c) => {
  const data = c.req.valid("json");
  try {
    const updated = await updateSiteSettings(data);
    return c.json(updated);
  } catch (error) {
    console.error("Error updating site settings:", error);
    return jsonError(c, 500, "ADMIN_SETTINGS_UPDATE_FAILED", "Failed to update site settings");
  }
});

// ---------------------------------------------------------------------------
// Email settings
// ---------------------------------------------------------------------------

const updateEmailSettingsSchema = z.object({
  provider: z.enum(["none", "resend", "smtp"]).optional(),
  resendApiKey: z.string().max(500).nullable().optional(),
  resendFrom: z.string().max(200).nullable().optional(),
  smtpHost: z.string().max(200).nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().max(200).nullable().optional(),
  smtpPass: z.string().max(500).nullable().optional(),
  smtpFrom: z.string().max(200).nullable().optional(),
});

adminRoutes.get("/email-settings", async (c) => {
  try {
    const settings = await getEmailSettings();
    // Mask sensitive fields
    return c.json({
      ...settings,
      resendApiKey: settings.resendApiKey ? "••••••••" : null,
      smtpPass: settings.smtpPass ? "••••••••" : null,
    });
  } catch (error) {
    console.error("Error fetching email settings:", error);
    return jsonError(c, 500, "ADMIN_EMAIL_SETTINGS_FETCH_FAILED", "Failed to fetch email settings");
  }
});

adminRoutes.put("/email-settings", zValidator("json", updateEmailSettingsSchema), async (c) => {
  const data = c.req.valid("json");
  try {
    // Strip masked placeholder values so we don't overwrite real secrets
    if (data.resendApiKey === "••••••••") delete data.resendApiKey;
    if (data.smtpPass === "••••••••") delete data.smtpPass;
    const updated = await updateEmailSettings(data);
    return c.json({
      ...updated,
      resendApiKey: updated.resendApiKey ? "••••••••" : null,
      smtpPass: updated.smtpPass ? "••••••••" : null,
    });
  } catch (error) {
    console.error("Error updating email settings:", error);
    return jsonError(c, 500, "ADMIN_EMAIL_SETTINGS_UPDATE_FAILED", "Failed to update email settings");
  }
});

// ---------------------------------------------------------------------------
// LLM provider settings
// ---------------------------------------------------------------------------

const updateLlmSettingsSchema = z.object({
  provider: z.enum(["google", "vertex", "zhipu"]).optional(),
  geminiApiKey: z.string().max(500).nullable().optional(),
  geminiTextModel: z.string().max(100).nullable().optional(),
  vertexProject: z.string().max(200).nullable().optional(),
  vertexLocation: z.string().max(100).nullable().optional(),
  vertexModel: z.string().max(100).nullable().optional(),
  zhipuApiKey: z.string().max(500).nullable().optional(),
  zhipuTextModel: z.string().max(100).nullable().optional(),
});

adminRoutes.get("/llm-settings", async (c) => {
  try {
    const settings = await getLlmSettings();
    return c.json({
      ...settings,
      geminiApiKey: settings.geminiApiKey ? "••••••••" : null,
      zhipuApiKey: settings.zhipuApiKey ? "••••••••" : null,
    });
  } catch (error) {
    console.error("Error fetching LLM settings:", error);
    return jsonError(c, 500, "ADMIN_LLM_SETTINGS_FETCH_FAILED", "Failed to fetch LLM settings");
  }
});

adminRoutes.put("/llm-settings", zValidator("json", updateLlmSettingsSchema), async (c) => {
  const data = c.req.valid("json");
  try {
    // Strip masked placeholder values so we don't overwrite real secrets
    if (data.geminiApiKey === "••••••••") delete data.geminiApiKey;
    if (data.zhipuApiKey === "••••••••") delete data.zhipuApiKey;
    const updated = await updateLlmSettings(data);
    return c.json({
      ...updated,
      geminiApiKey: updated.geminiApiKey ? "••••••••" : null,
      zhipuApiKey: updated.zhipuApiKey ? "••••••••" : null,
    });
  } catch (error) {
    console.error("Error updating LLM settings:", error);
    return jsonError(c, 500, "ADMIN_LLM_SETTINGS_UPDATE_FAILED", "Failed to update LLM settings");
  }
});

adminRoutes.post("/llm-settings/test", async (c) => {
  try {
    const settings = await getLlmSettings();
    const provider = resolveTextProvider(settings.provider);
    const overrides: LlmOverrides = {
      geminiApiKey: settings.geminiApiKey,
      geminiTextModel: settings.geminiTextModel,
      vertexProject: settings.vertexProject,
      vertexLocation: settings.vertexLocation,
      vertexModel: settings.vertexModel,
      zhipuApiKey: settings.zhipuApiKey,
      zhipuTextModel: settings.zhipuTextModel,
    };

    if (!isTextGenerationEnabled(provider, overrides)) {
      return c.json({ ok: false, error: "API key is not configured for the selected provider." }, 400);
    }

    const model = createChatModel({ provider, temperature: 0, overrides });
    const { HumanMessage } = await import("@langchain/core/messages");
    const response = await model.invoke([new HumanMessage("Reply with exactly: OK")]);
    const text = typeof response.content === "string" ? response.content.trim() : String(response.content).trim();

    return c.json({ ok: true, reply: text });
  } catch (error) {
    console.error("LLM test failed:", error);
    return c.json({ ok: false, error: "LLM connection test failed" }, 502);
  }
});

// ---------------------------------------------------------------------------
// Site icon upload / delete
// ---------------------------------------------------------------------------

const SITE_ICON_MAX_BYTES = 256 * 1024;
const SITE_ICON_ALLOWED_TYPES = new Set([
  "image/png",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);
const SITE_ICON_STORAGE_PATH = "site/site-icon";

adminRoutes.post("/site-icon", async (c) => {
  try {
    const contentType = c.req.header("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonError(c, 400, "SITE_ICON_MULTIPART_REQUIRED", "Multipart form data required");
    }

    const body = await c.req.parseBody();
    const uploadedFile = body.file as File | undefined;
    if (!uploadedFile) {
      return jsonError(c, 400, "SITE_ICON_FILE_REQUIRED", "File is required");
    }

    if (!SITE_ICON_ALLOWED_TYPES.has(uploadedFile.type)) {
      return jsonError(c, 400, "SITE_ICON_FORMAT_ERROR", "Only PNG, SVG, and ICO files are allowed");
    }

    if (uploadedFile.size > SITE_ICON_MAX_BYTES) {
      return jsonError(c, 400, "SITE_ICON_SIZE_ERROR", "File must be 256KB or smaller");
    }

    const arrayBuffer = await uploadedFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await saveFile(SITE_ICON_STORAGE_PATH, buffer);

    await upsertSiteSetting("siteIconStoragePath", SITE_ICON_STORAGE_PATH);
    await upsertSiteSetting("siteIconContentType", uploadedFile.type);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error uploading site icon:", error);
    return jsonError(c, 500, "SITE_ICON_UPLOAD_FAILED", "Failed to upload site icon");
  }
});

adminRoutes.delete("/site-icon", async (c) => {
  try {
    await removeFile(SITE_ICON_STORAGE_PATH);

    await deleteSiteSetting("siteIconStoragePath");
    await deleteSiteSetting("siteIconContentType");

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting site icon:", error);
    return jsonError(c, 500, "SITE_ICON_DELETE_FAILED", "Failed to delete site icon");
  }
});

// ---------------------------------------------------------------------------
// Storage provider settings
// ---------------------------------------------------------------------------

const updateStorageSettingsSchema = z.object({
  provider: z.enum(["local", "s3", "gcs"]).optional(),
  localPath: z.string().max(500).nullable().optional(),
  s3Endpoint: z.string().max(500).nullable().optional(),
  s3Region: z.string().max(100).nullable().optional(),
  s3Bucket: z.string().max(200).nullable().optional(),
  s3AccessKey: z.string().max(500).nullable().optional(),
  s3SecretKey: z.string().max(500).nullable().optional(),
  s3ForcePathStyle: z.boolean().optional(),
  gcsBucket: z.string().max(200).nullable().optional(),
  gcsProjectId: z.string().max(200).nullable().optional(),
  gcsKeyJson: z.string().max(10000).nullable().optional(),
});

adminRoutes.get("/storage-settings", async (c) => {
  try {
    const settings = await getStorageSettings();
    return c.json({
      ...settings,
      s3SecretKey: settings.s3SecretKey ? "••••••••" : null,
      gcsKeyJson: settings.gcsKeyJson ? "••••••••" : null,
    });
  } catch (error) {
    console.error("Error fetching storage settings:", error);
    return jsonError(c, 500, "ADMIN_STORAGE_SETTINGS_FETCH_FAILED", "Failed to fetch storage settings");
  }
});

adminRoutes.put("/storage-settings", zValidator("json", updateStorageSettingsSchema), async (c) => {
  const data = c.req.valid("json");
  try {
    // Strip masked placeholder values so we don't overwrite real secrets
    if (data.s3SecretKey === "••••••••") delete data.s3SecretKey;
    if (data.gcsKeyJson === "••••••••") delete data.gcsKeyJson;
    const updated = await updateStorageSettings(data);

    // Apply the new provider immediately
    setStorageProvider(
      createStorageProvider({
        provider: updated.provider,
        localPath: updated.localPath ?? undefined,
        s3Endpoint: updated.s3Endpoint ?? undefined,
        s3Region: updated.s3Region ?? undefined,
        s3Bucket: updated.s3Bucket ?? undefined,
        s3AccessKey: updated.s3AccessKey ?? undefined,
        s3SecretKey: updated.s3SecretKey ?? undefined,
        s3ForcePathStyle: updated.s3ForcePathStyle,
        gcsBucket: updated.gcsBucket ?? undefined,
        gcsProjectId: updated.gcsProjectId ?? undefined,
        gcsKeyJson: updated.gcsKeyJson ?? undefined,
      }),
    );

    return c.json({
      ...updated,
      s3SecretKey: updated.s3SecretKey ? "••••••••" : null,
      gcsKeyJson: updated.gcsKeyJson ? "••••••••" : null,
    });
  } catch (error) {
    console.error("Error updating storage settings:", error);
    return jsonError(c, 500, "ADMIN_STORAGE_SETTINGS_UPDATE_FAILED", "Failed to update storage settings");
  }
});

adminRoutes.post("/storage-settings/test", async (c) => {
  try {
    const settings = await getStorageSettings();
    const testProvider = createStorageProvider({
      provider: settings.provider,
      localPath: settings.localPath ?? undefined,
      s3Endpoint: settings.s3Endpoint ?? undefined,
      s3Region: settings.s3Region ?? undefined,
      s3Bucket: settings.s3Bucket ?? undefined,
      s3AccessKey: settings.s3AccessKey ?? undefined,
      s3SecretKey: settings.s3SecretKey ?? undefined,
      s3ForcePathStyle: settings.s3ForcePathStyle,
      gcsBucket: settings.gcsBucket ?? undefined,
      gcsProjectId: settings.gcsProjectId ?? undefined,
      gcsKeyJson: settings.gcsKeyJson ?? undefined,
    });

    const testPath = `_test/${crypto.randomUUID()}`;
    const testData = Buffer.from("storage-provider-test");

    await testProvider.save(testPath, testData);
    const loaded = await testProvider.load(testPath);
    await testProvider.remove(testPath);

    if (loaded.toString() !== "storage-provider-test") {
      return c.json({ ok: false, error: "Read-back verification failed" }, 502);
    }

    return c.json({ ok: true, provider: settings.provider });
  } catch (error) {
    console.error("Storage test failed:", error);
    return c.json({ ok: false, error: "Storage connection test failed" }, 502);
  }
});
