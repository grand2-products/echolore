import { ALL_GROUP_PERMISSIONS, type GroupPermission, UserRole } from "@echolore/shared/contracts";
import { z } from "zod";

const LLM_PROVIDER_ENUM = ["google", "vertex", "zhipu", "openai-compatible"] as const;

/** Provider-specific fields shared by LLM settings and config set schemas. */
const llmProviderFieldsSchema = {
  geminiApiKey: z.string().max(500).nullable().optional(),
  geminiTextModel: z.string().max(100).nullable().optional(),
  vertexProject: z.string().max(200).nullable().optional(),
  vertexLocation: z.string().max(100).nullable().optional(),
  vertexModel: z.string().max(100).nullable().optional(),
  zhipuApiKey: z.string().max(500).nullable().optional(),
  zhipuTextModel: z.string().max(100).nullable().optional(),
  zhipuUseCodingPlan: z.boolean().optional(),
  openaiCompatBaseUrl: z.string().url().max(500).nullable().optional(),
  openaiCompatApiKey: z.string().max(500).nullable().optional(),
  openaiCompatModel: z.string().max(100).nullable().optional(),
};

export const groupPermissionSchema = z.enum(
  ALL_GROUP_PERMISSIONS as [GroupPermission, ...GroupPermission[]]
);

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(groupPermissionSchema),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  permissions: z.array(groupPermissionSchema).optional(),
});

export const addMembersSchema = z.object({ userIds: z.array(z.string()).min(1) });

export const updateUserGroupsSchema = z.object({ groupIds: z.array(z.string()) });

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  systemPrompt: z.string().min(1).max(10000),
  voiceProfile: z.string().nullable().optional(),
  interventionStyle: z.string().min(1).max(1000),
  defaultProvider: z.enum(LLM_PROVIDER_ENUM).default("google"),
  llmConfigSetId: z.string().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
  autonomousEnabled: z.boolean().optional(),
  autonomousCooldownSec: z.number().int().min(10).max(3600).optional(),
});

export const updateAgentSchema = createAgentSchema.partial();

export const updateUserRoleSchema = z.object({ role: z.enum([UserRole.Admin, UserRole.Member]) });

export const updateSiteSettingsSchema = z.object({
  siteTitle: z.string().max(200).optional(),
  siteTagline: z.string().max(500).optional(),
  livekitMeetingSimulcast: z.boolean().optional(),
  livekitMeetingDynacast: z.boolean().optional(),
  livekitMeetingAdaptiveStream: z.boolean().optional(),
  livekitCoworkingSimulcast: z.boolean().optional(),
  livekitCoworkingDynacast: z.boolean().optional(),
  livekitCoworkingAdaptiveStream: z.boolean().optional(),
  livekitCoworkingMode: z.enum(["sfu", "mcu"]).optional(),
  livekitCoworkingMcuWidth: z.number().int().min(320).max(1920).optional(),
  livekitCoworkingMcuHeight: z.number().int().min(240).max(1080).optional(),
  livekitCoworkingMcuFps: z.number().int().min(1).max(30).optional(),
  livekitCoworkingFocusIdentity: z.string().max(200).nullable().optional(),
});

export const replaceSpacePermissionsSchema = z.object({
  permissions: z
    .array(
      z.object({
        groupId: z.string(),
        canRead: z.boolean(),
        canWrite: z.boolean(),
        canDelete: z.boolean(),
      })
    )
    .refine((perms) => new Set(perms.map((p) => p.groupId)).size === perms.length, {
      message: "Duplicate groupId in permissions",
    }),
});

export const updateEmailSettingsSchema = z.object({
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

export const updateLlmSettingsSchema = z.object({
  provider: z.enum(LLM_PROVIDER_ENUM).optional(),
  ...llmProviderFieldsSchema,
  embeddingEnabled: z.boolean().optional(),
  embeddingProvider: z.enum(["google", "vertex"]).optional(),
  embeddingModel: z.string().max(100).nullable().optional(),
});

export const updateStorageSettingsSchema = z.object({
  provider: z.enum(["local", "s3", "gcs"]).optional(),
  localPath: z.string().max(500).nullable().optional(),
  s3Endpoint: z.string().max(500).nullable().optional(),
  s3Region: z.string().max(100).nullable().optional(),
  s3Bucket: z.string().max(200).nullable().optional(),
  s3AccessKey: z.string().max(500).nullable().optional(),
  s3SecretKey: z.string().max(500).nullable().optional(),
  s3ForcePathStyle: z.boolean().optional(),
  gcsBucket: z.string().max(200).nullable().optional(),
  gcsUseGcpDefaults: z.boolean().optional(),
  gcsProjectId: z.string().max(200).nullable().optional(),
  gcsKeyJson: z.string().max(10000).nullable().optional(),
});

export const updateBackupSettingsSchema = z.object({
  provider: z.enum(["gcs", "s3"]).nullable().optional(),
  retentionDays: z.number().int().min(1).max(365).nullable().optional(),
  s3Endpoint: z.string().max(500).nullable().optional(),
  s3Region: z.string().max(100).nullable().optional(),
  s3Bucket: z.string().max(200).nullable().optional(),
  s3AccessKey: z.string().max(500).nullable().optional(),
  s3SecretKey: z.string().max(500).nullable().optional(),
  s3ForcePathStyle: z.boolean().optional(),
  gcsBucket: z.string().max(200).nullable().optional(),
  gcsUseGcpDefaults: z.boolean().optional(),
  gcsProjectId: z.string().max(200).nullable().optional(),
  gcsKeyJson: z.string().max(10000).nullable().optional(),
  slackWebhookUrl: z.string().url().max(500).nullable().optional(),
  notificationEmail: z.string().email().max(500).nullable().optional(),
});

export const updateDriveSettingsSchema = z.object({
  driveEnabled: z.boolean().optional(),
  sharedDriveIds: z.string().max(2000).nullable().optional(),
  syncIntervalMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  includeMimeTypes: z.string().max(2000).nullable().optional(),
  excludeFolderIds: z.string().max(2000).nullable().optional(),
  maxFileSizeBytes: z
    .number()
    .int()
    .min(0)
    .max(100 * 1024 * 1024)
    .nullable()
    .optional(),
});

export const updateGithubSettingsSchema = z.object({
  githubEnabled: z.boolean().optional(),
  githubAppId: z.string().max(100).nullable().optional(),
  githubAppPrivateKey: z.string().max(20000).nullable().optional(),
  githubWebhookSecret: z.string().max(500).nullable().optional(),
  syncIntervalMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  maxFileSizeBytes: z
    .number()
    .int()
    .min(0)
    .max(100 * 1024 * 1024)
    .nullable()
    .optional(),
});

export const createGithubRepoSchema = z.object({
  owner: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  pathPrefix: z.string().max(500).default(""),
  installationId: z.number().int(),
  branch: z.string().max(200).default("main"),
  accessScope: z.enum(["all_members", "admins", "groups"]).default("all_members"),
  fileExtensions: z.array(z.string().max(20)).min(1).max(50).optional(),
  groupIds: z.array(z.string()).optional(),
});

export const updateGithubRepoSchema = z.object({
  pathPrefix: z.string().max(500).optional(),
  branch: z.string().max(200).optional(),
  accessScope: z.enum(["all_members", "admins", "groups"]).optional(),
  fileExtensions: z.array(z.string().max(20)).min(1).max(50).optional(),
  groupIds: z.array(z.string()).optional(),
});

export const updateGcpCredentialsSchema = z.object({
  gcpProjectId: z.string().max(200).nullable().optional(),
  gcpServiceAccountKeyJson: z.string().max(10000).nullable().optional(),
});

export const createLlmConfigSetSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(LLM_PROVIDER_ENUM).default("google"),
  ...llmProviderFieldsSchema,
});

export const updateLlmConfigSetSchema = createLlmConfigSetSchema.partial();

export const updateConfigSetAssignmentsSchema = z.object({
  aiChat: z.string().max(100).optional(),
  aituber: z.string().max(100).optional(),
  meetingAgent: z.string().max(100).optional(),
});

export const updateAuthSettingsSchema = z.object({
  googleClientId: z.string().max(500).nullable().optional(),
  googleClientSecret: z.string().max(500).nullable().optional(),
  allowedDomain: z.string().max(200).nullable().optional(),
  googleIosClientId: z.string().max(500).nullable().optional(),
  googleAndroidClientId: z.string().max(500).nullable().optional(),
  googleOauthAudiences: z.string().max(1000).nullable().optional(),
});
