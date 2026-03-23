import { ALL_GROUP_PERMISSIONS, type GroupPermission, UserRole } from "@echolore/shared/contracts";
import { z } from "zod";

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
  defaultProvider: z.enum(["google", "vertex", "zhipu"]).default("google"),
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
  provider: z.enum(["google", "vertex", "zhipu"]).optional(),
  geminiApiKey: z.string().max(500).nullable().optional(),
  geminiTextModel: z.string().max(100).nullable().optional(),
  vertexProject: z.string().max(200).nullable().optional(),
  vertexLocation: z.string().max(100).nullable().optional(),
  vertexModel: z.string().max(100).nullable().optional(),
  zhipuApiKey: z.string().max(500).nullable().optional(),
  zhipuTextModel: z.string().max(100).nullable().optional(),
  zhipuUseCodingPlan: z.boolean().optional(),
  embeddingEnabled: z.boolean().optional(),
  embeddingProvider: z.enum(["google", "vertex"]).optional(),
  embeddingModel: z.string().max(100).nullable().optional(),
  embeddingDimensions: z
    .union([z.literal(768), z.literal(1536), z.literal(3072)])
    .nullable()
    .optional(),
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
});

export const updateGcpCredentialsSchema = z.object({
  gcpProjectId: z.string().max(200).nullable().optional(),
  gcpServiceAccountKeyJson: z.string().max(10000).nullable().optional(),
});

export const updateAuthSettingsSchema = z.object({
  googleClientId: z.string().max(500).nullable().optional(),
  googleClientSecret: z.string().max(500).nullable().optional(),
  allowedDomain: z.string().max(200).nullable().optional(),
  googleIosClientId: z.string().max(500).nullable().optional(),
  googleAndroidClientId: z.string().max(500).nullable().optional(),
  googleOauthAudiences: z.string().max(1000).nullable().optional(),
});
