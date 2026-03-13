import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import { pageInheritance, pagePermissions, userGroupMemberships } from "../../db/schema.js";
import type { StorageProviderType } from "../../lib/file-storage.js";
import {
  getGroupById,
  getPageInheritance,
  getSiteSetting,
  listGroups,
  listMemberships,
  listMembershipsByGroup,
  listPagePermissions,
  listUsersForAdmin,
  listUsersWithIds,
  updateUserRole,
  upsertSiteSetting,
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
  autonomousEnabled?: boolean;
  autonomousCooldownSec?: number;
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
    autonomousEnabled: input.autonomousEnabled ?? false,
    autonomousCooldownSec: input.autonomousCooldownSec ?? 120,
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
    autonomousEnabled?: boolean;
    autonomousCooldownSec?: number;
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

export async function getSiteSettings() {
  const [
    title, tagline,
    meetingSimulcast, meetingDynacast, meetingAdaptiveStream,
    coworkingSimulcast, coworkingDynacast, coworkingAdaptiveStream,
    siteIconPath,
  ] = await Promise.all([
    getSiteSetting("siteTitle"),
    getSiteSetting("siteTagline"),
    getSiteSetting("livekitMeetingSimulcast"),
    getSiteSetting("livekitMeetingDynacast"),
    getSiteSetting("livekitMeetingAdaptiveStream"),
    getSiteSetting("livekitCoworkingSimulcast"),
    getSiteSetting("livekitCoworkingDynacast"),
    getSiteSetting("livekitCoworkingAdaptiveStream"),
    getSiteSetting("siteIconGcsPath"),
  ]);
  return {
    siteTitle: title?.value ?? null,
    siteTagline: tagline?.value ?? null,
    livekitMeetingSimulcast: meetingSimulcast?.value !== "false",
    livekitMeetingDynacast: meetingDynacast?.value !== "false",
    livekitMeetingAdaptiveStream: meetingAdaptiveStream?.value !== "false",
    livekitCoworkingSimulcast: coworkingSimulcast?.value !== "false",
    livekitCoworkingDynacast: coworkingDynacast?.value !== "false",
    livekitCoworkingAdaptiveStream: coworkingAdaptiveStream?.value !== "false",
    hasSiteIcon: Boolean(siteIconPath?.value),
  };
}

export async function updateSiteSettings(input: {
  siteTitle?: string;
  siteTagline?: string;
  livekitMeetingSimulcast?: boolean;
  livekitMeetingDynacast?: boolean;
  livekitMeetingAdaptiveStream?: boolean;
  livekitCoworkingSimulcast?: boolean;
  livekitCoworkingDynacast?: boolean;
  livekitCoworkingAdaptiveStream?: boolean;
}) {
  const results: Record<string, string | boolean> = {};
  if (input.siteTitle !== undefined) {
    await upsertSiteSetting("siteTitle", input.siteTitle);
    results.siteTitle = input.siteTitle;
  }
  if (input.siteTagline !== undefined) {
    await upsertSiteSetting("siteTagline", input.siteTagline);
    results.siteTagline = input.siteTagline;
  }
  const boolKeys = [
    "livekitMeetingSimulcast", "livekitMeetingDynacast", "livekitMeetingAdaptiveStream",
    "livekitCoworkingSimulcast", "livekitCoworkingDynacast", "livekitCoworkingAdaptiveStream",
  ] as const;
  for (const key of boolKeys) {
    if (input[key] !== undefined) {
      await upsertSiteSetting(key, String(input[key]));
      results[key] = input[key]!;
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Email provider settings
// ---------------------------------------------------------------------------

export type EmailProvider = "none" | "resend" | "smtp";

export interface EmailSettings {
  provider: EmailProvider;
  resendApiKey: string | null;
  resendFrom: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFrom: string | null;
}

const EMAIL_SETTING_KEYS = [
  "emailProvider",
  "emailResendApiKey",
  "emailResendFrom",
  "emailSmtpHost",
  "emailSmtpPort",
  "emailSmtpSecure",
  "emailSmtpUser",
  "emailSmtpPass",
  "emailSmtpFrom",
] as const;

export async function getEmailSettings(): Promise<EmailSettings> {
  const entries = await Promise.all(
    EMAIL_SETTING_KEYS.map(async (key) => {
      const row = await getSiteSetting(key);
      return [key, row?.value ?? null] as const;
    }),
  );
  const map = Object.fromEntries(entries) as Record<string, string | null>;

  return {
    provider: (map.emailProvider as EmailProvider) || "none",
    resendApiKey: map.emailResendApiKey || null,
    resendFrom: map.emailResendFrom || null,
    smtpHost: map.emailSmtpHost || null,
    smtpPort: map.emailSmtpPort ? Number(map.emailSmtpPort) : null,
    smtpSecure: map.emailSmtpSecure === "true",
    smtpUser: map.emailSmtpUser || null,
    smtpPass: map.emailSmtpPass || null,
    smtpFrom: map.emailSmtpFrom || null,
  };
}

export async function updateEmailSettings(input: Partial<EmailSettings>) {
  const keyMap: Record<string, string | undefined> = {
    emailProvider: input.provider,
    emailResendApiKey: input.resendApiKey ?? undefined,
    emailResendFrom: input.resendFrom ?? undefined,
    emailSmtpHost: input.smtpHost ?? undefined,
    emailSmtpPort: input.smtpPort != null ? String(input.smtpPort) : undefined,
    emailSmtpSecure: input.smtpSecure != null ? String(input.smtpSecure) : undefined,
    emailSmtpUser: input.smtpUser ?? undefined,
    emailSmtpPass: input.smtpPass ?? undefined,
    emailSmtpFrom: input.smtpFrom ?? undefined,
  };

  for (const [key, value] of Object.entries(keyMap)) {
    if (value !== undefined) {
      await upsertSiteSetting(key, value);
    }
  }

  return getEmailSettings();
}

// ---------------------------------------------------------------------------
// LLM provider settings
// ---------------------------------------------------------------------------

export type LlmProvider = "google" | "vertex" | "zhipu";

export interface LlmSettings {
  provider: LlmProvider;
  geminiApiKey: string | null;
  geminiTextModel: string | null;
  vertexProject: string | null;
  vertexLocation: string | null;
  vertexModel: string | null;
  zhipuApiKey: string | null;
  zhipuTextModel: string | null;
}

const LLM_SETTING_KEYS = [
  "llmProvider",
  "llmGeminiApiKey",
  "llmGeminiTextModel",
  "llmVertexProject",
  "llmVertexLocation",
  "llmVertexModel",
  "llmZhipuApiKey",
  "llmZhipuTextModel",
] as const;

export async function getLlmSettings(): Promise<LlmSettings> {
  const entries = await Promise.all(
    LLM_SETTING_KEYS.map(async (key) => {
      const row = await getSiteSetting(key);
      return [key, row?.value ?? null] as const;
    }),
  );
  const map = Object.fromEntries(entries) as Record<string, string | null>;

  return {
    provider: (map.llmProvider as LlmProvider) || "google",
    geminiApiKey: map.llmGeminiApiKey || null,
    geminiTextModel: map.llmGeminiTextModel || null,
    vertexProject: map.llmVertexProject || null,
    vertexLocation: map.llmVertexLocation || null,
    vertexModel: map.llmVertexModel || null,
    zhipuApiKey: map.llmZhipuApiKey || null,
    zhipuTextModel: map.llmZhipuTextModel || null,
  };
}

export async function updateLlmSettings(input: Partial<LlmSettings>) {
  const keyMap: Record<string, string | undefined> = {
    llmProvider: input.provider,
    llmGeminiApiKey: input.geminiApiKey ?? undefined,
    llmGeminiTextModel: input.geminiTextModel ?? undefined,
    llmVertexProject: input.vertexProject ?? undefined,
    llmVertexLocation: input.vertexLocation ?? undefined,
    llmVertexModel: input.vertexModel ?? undefined,
    llmZhipuApiKey: input.zhipuApiKey ?? undefined,
    llmZhipuTextModel: input.zhipuTextModel ?? undefined,
  };

  for (const [key, value] of Object.entries(keyMap)) {
    if (value !== undefined) {
      await upsertSiteSetting(key, value);
    }
  }

  return getLlmSettings();
}

export async function changeUserRole(userId: string, role: string) {
  return updateUserRole(userId, role);
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

// ---------------------------------------------------------------------------
// Storage provider settings
// ---------------------------------------------------------------------------

export interface StorageSettings {
  provider: StorageProviderType;
  localPath: string | null;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: string | null;
  s3AccessKey: string | null;
  s3SecretKey: string | null;
  s3ForcePathStyle: boolean;
  gcsBucket: string | null;
  gcsProjectId: string | null;
  gcsKeyJson: string | null;
}

const STORAGE_SETTING_KEYS = [
  "storageProvider",
  "storageLocalPath",
  "storageS3Endpoint",
  "storageS3Region",
  "storageS3Bucket",
  "storageS3AccessKey",
  "storageS3SecretKey",
  "storageS3ForcePathStyle",
  "storageGcsBucket",
  "storageGcsProjectId",
  "storageGcsKeyJson",
] as const;

export async function getStorageSettings(): Promise<StorageSettings> {
  const entries = await Promise.all(
    STORAGE_SETTING_KEYS.map(async (key) => {
      const row = await getSiteSetting(key);
      return [key, row?.value ?? null] as const;
    }),
  );
  const map = Object.fromEntries(entries) as Record<string, string | null>;

  return {
    provider: (map.storageProvider as StorageProviderType) || "local",
    localPath: map.storageLocalPath || null,
    s3Endpoint: map.storageS3Endpoint || null,
    s3Region: map.storageS3Region || null,
    s3Bucket: map.storageS3Bucket || null,
    s3AccessKey: map.storageS3AccessKey || null,
    s3SecretKey: map.storageS3SecretKey || null,
    s3ForcePathStyle: map.storageS3ForcePathStyle === "false" ? false : true,
    gcsBucket: map.storageGcsBucket || null,
    gcsProjectId: map.storageGcsProjectId || null,
    gcsKeyJson: map.storageGcsKeyJson || null,
  };
}

export async function updateStorageSettings(input: Partial<StorageSettings>) {
  const keyMap: Record<string, string | undefined> = {
    storageProvider: input.provider,
    storageLocalPath: input.localPath ?? undefined,
    storageS3Endpoint: input.s3Endpoint ?? undefined,
    storageS3Region: input.s3Region ?? undefined,
    storageS3Bucket: input.s3Bucket ?? undefined,
    storageS3AccessKey: input.s3AccessKey ?? undefined,
    storageS3SecretKey: input.s3SecretKey ?? undefined,
    storageS3ForcePathStyle: input.s3ForcePathStyle !== undefined ? String(input.s3ForcePathStyle) : undefined,
    storageGcsBucket: input.gcsBucket ?? undefined,
    storageGcsProjectId: input.gcsProjectId ?? undefined,
    storageGcsKeyJson: input.gcsKeyJson ?? undefined,
  };

  for (const [key, value] of Object.entries(keyMap)) {
    if (value !== undefined) {
      await upsertSiteSetting(key, value);
    }
  }

  return getStorageSettings();
}
