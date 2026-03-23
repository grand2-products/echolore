/**
 * API type aliases and interfaces used across the API client.
 */

import type {
  AdminGroupDetailDto,
  AdminGroupDto,
  AdminSpacePermissionRecordDto,
  AdminSpacePermissionsResponseDto,
  AdminUserGroupRefDto,
  AdminUserRecordDto,
  AiChatConversationDto,
  AiChatMessageDto,
  AuthMeResponseDto,
  AuthSessionDto,
  BlockDto,
  FileMetadataDto,
  MeetingDto,
  PageDto,
  PageRevisionDto,
  RealtimeTranscriptSegmentDto,
  SessionUserDto,
  SpaceDto,
  SummaryDto,
  TranscriptDto,
  UserDto,
} from "@echolore/shared/contracts";

// Re-exported DTO aliases
export type User = UserDto;
export type Page = PageDto;
export type PageRevision = PageRevisionDto;
export type Space = SpaceDto;
export type Block = BlockDto;
export type Meeting = MeetingDto;
export type Transcript = TranscriptDto;
export type Summary = SummaryDto;
export type FileMetadata = FileMetadataDto;
export type SessionUser = SessionUserDto;
export type AuthMeResponse = AuthMeResponseDto;
export type AuthSession = AuthSessionDto;
export type AiChatConversation = AiChatConversationDto;
export type AiChatMessage = AiChatMessageDto;

// Custom interfaces

export interface WikiSearchMeta {
  mode: "lexical" | "hybrid";
  semanticApplied: boolean;
  model?: string;
}

export interface WikiSearchResponse {
  pages: Page[];
  searchMeta?: WikiSearchMeta;
}

export interface KpiOverviewResponse {
  windowDays: number;
  since: string;
  metrics: {
    mau: number;
    searchTotal: number;
    searchSuccess: number;
    searchSuccessRate: number;
    meetingsTotal: number;
    meetingsWithMinutes: number;
    minutesUtilizationRate: number;
  };
  security: {
    authRejectedTotal: number;
    authzDeniedTotal: number;
  };
  alerts: {
    authRejected: {
      warningThreshold: number;
      criticalThreshold: number;
      warning: boolean;
      critical: boolean;
    };
    authzDenied: {
      warningThreshold: number;
      criticalThreshold: number;
      warning: boolean;
      critical: boolean;
    };
  };
}

export interface RunRoomAiPipelineResponse {
  meetingId: string;
  summary: Summary;
  wikiPage: {
    id: string;
    title: string;
  };
  reused: boolean;
}

export type RealtimeTranscriptSegment = RealtimeTranscriptSegmentDto;

export interface AgentDefinition {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  voiceProfile: string | null;
  interventionStyle: string;
  defaultProvider: string;
  isActive: boolean;
  autonomousEnabled: boolean;
  autonomousCooldownSec: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentRequest {
  name: string;
  description?: string | null;
  systemPrompt: string;
  voiceProfile?: string | null;
  interventionStyle: string;
  defaultProvider: "google" | "vertex" | "zhipu";
  isActive?: boolean;
  autonomousEnabled?: boolean;
  autonomousCooldownSec?: number;
}

export interface UpdateAgentRequest extends Partial<CreateAgentRequest> {}

export interface MeetingAgentEvent {
  id: string;
  meetingId: string;
  agentId: string;
  eventType: string;
  payload: Record<string, unknown>;
  triggeredByUserId: string | null;
  createdAt: string;
}

export interface MeetingAgentSession {
  id: string;
  meetingId: string;
  agentId: string;
  state: string;
  invokedByUserId: string;
  joinedAt: string | null;
  leftAt: string | null;
  createdAt: string;
}

export interface MeetingRecording {
  id: string;
  status: string;
  storagePath: string | null;
  fileSize: number | null;
  durationMs: number | null;
  contentType: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface MeetingAgentResponse {
  agent: {
    id: string;
    name: string;
    voiceProfile: string | null;
    provider: string;
  };
  sessionId: string;
  responseText: string;
  audio: {
    mimeType: string;
    base64: string;
  } | null;
}

export type AdminGroup = AdminGroupDto;
export type AdminGroupDetail = AdminGroupDetailDto;
export type AdminUserGroupRef = AdminUserGroupRefDto;
export type AdminUserRecord = AdminUserRecordDto;

export interface AdminPagePermissionRecord {
  id: string;
  pageId: string;
  groupId: string | null;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
  group: AdminUserGroupRef | null;
}

export interface AdminPagePermissionsResponse {
  pageId: string;
  inheritFromParent: boolean;
  permissions: AdminPagePermissionRecord[];
}

export type AdminSpacePermissionRecord = AdminSpacePermissionRecordDto;
export type AdminSpacePermissionsResponse = AdminSpacePermissionsResponseDto;

export interface SiteSettings {
  siteTitle: string;
  siteTagline: string;
  livekitMeetingSimulcast: boolean;
  livekitMeetingDynacast: boolean;
  livekitMeetingAdaptiveStream: boolean;
  livekitCoworkingSimulcast: boolean;
  livekitCoworkingDynacast: boolean;
  livekitCoworkingAdaptiveStream: boolean;
  livekitCoworkingMode: "sfu" | "mcu";
  livekitCoworkingMcuWidth: number;
  livekitCoworkingMcuHeight: number;
  livekitCoworkingMcuFps: number;
  livekitCoworkingFocusIdentity: string | null;
  hasSiteIcon: boolean;
  googleOAuthEnabled: boolean;
  llmEnabled: boolean;
}

export interface UpdateSiteSettingsRequest {
  siteTitle?: string;
  siteTagline?: string;
  livekitMeetingSimulcast?: boolean;
  livekitMeetingDynacast?: boolean;
  livekitMeetingAdaptiveStream?: boolean;
  livekitCoworkingSimulcast?: boolean;
  livekitCoworkingDynacast?: boolean;
  livekitCoworkingAdaptiveStream?: boolean;
  livekitCoworkingMode?: "sfu" | "mcu";
  livekitCoworkingMcuWidth?: number;
  livekitCoworkingMcuHeight?: number;
  livekitCoworkingMcuFps?: number;
  livekitCoworkingFocusIdentity?: string | null;
}

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

export interface UpdateEmailSettingsRequest {
  provider?: EmailProvider;
  resendApiKey?: string | null;
  resendFrom?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpFrom?: string | null;
}

export type LlmProvider = "google" | "vertex" | "zhipu";
export type EmbeddingProvider = "google" | "vertex";

export interface LlmSettings {
  provider: LlmProvider;
  geminiApiKey: string | null;
  geminiTextModel: string | null;
  vertexProject: string | null;
  vertexLocation: string | null;
  vertexModel: string | null;
  zhipuApiKey: string | null;
  zhipuTextModel: string | null;
  zhipuUseCodingPlan: boolean;
  embeddingEnabled: boolean;
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
}

export interface UpdateLlmSettingsRequest {
  provider?: LlmProvider;
  geminiApiKey?: string | null;
  geminiTextModel?: string | null;
  vertexProject?: string | null;
  vertexLocation?: string | null;
  vertexModel?: string | null;
  zhipuApiKey?: string | null;
  zhipuTextModel?: string | null;
  zhipuUseCodingPlan?: boolean;
  embeddingEnabled?: boolean;
  embeddingProvider?: EmbeddingProvider;
  embeddingModel?: string | null;
  embeddingDimensions?: number | null;
}

export interface GcpCredentials {
  gcpProjectId: string | null;
  gcpServiceAccountKeyJson: string | null;
}

export interface UpdateGcpCredentialsRequest {
  gcpProjectId?: string | null;
  gcpServiceAccountKeyJson?: string | null;
}

export interface AuthSettings {
  googleClientId: string | null;
  googleClientSecret: string | null;
  allowedDomain: string | null;
  googleIosClientId: string | null;
  googleAndroidClientId: string | null;
  googleOauthAudiences: string | null;
}

export interface UpdateAuthSettingsRequest {
  googleClientId?: string | null;
  googleClientSecret?: string | null;
  allowedDomain?: string | null;
  googleIosClientId?: string | null;
  googleAndroidClientId?: string | null;
  googleOauthAudiences?: string | null;
}

export type StorageProviderType = "local" | "s3" | "gcs";

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
  gcsUseGcpDefaults: boolean;
  gcsProjectId: string | null;
  gcsKeyJson: string | null;
}

export interface UpdateStorageSettingsRequest {
  provider?: StorageProviderType;
  localPath?: string | null;
  s3Endpoint?: string | null;
  s3Region?: string | null;
  s3Bucket?: string | null;
  s3AccessKey?: string | null;
  s3SecretKey?: string | null;
  s3ForcePathStyle?: boolean;
  gcsBucket?: string | null;
  gcsUseGcpDefaults?: boolean;
  gcsProjectId?: string | null;
  gcsKeyJson?: string | null;
}

export type BackupProviderType = "gcs" | "s3";

export interface BackupSettings {
  provider: BackupProviderType | null;
  retentionDays: number | null;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: string | null;
  s3AccessKey: string | null;
  s3SecretKey: string | null;
  s3ForcePathStyle: boolean;
  gcsBucket: string | null;
  gcsUseGcpDefaults: boolean;
  gcsProjectId: string | null;
  gcsKeyJson: string | null;
  slackWebhookUrl: string | null;
}

export interface UpdateBackupSettingsRequest {
  provider?: BackupProviderType | null;
  retentionDays?: number | null;
  s3Endpoint?: string | null;
  s3Region?: string | null;
  s3Bucket?: string | null;
  s3AccessKey?: string | null;
  s3SecretKey?: string | null;
  s3ForcePathStyle?: boolean;
  gcsBucket?: string | null;
  gcsUseGcpDefaults?: boolean;
  gcsProjectId?: string | null;
  gcsKeyJson?: string | null;
  slackWebhookUrl?: string | null;
}

export interface BackupEntry {
  name: string;
  size: number;
  createdAt: string;
}

export type BackupHealthStatus = "healthy" | "warning" | "critical" | "unconfigured";

export interface BackupListResponse {
  backups: BackupEntry[];
  latestAt: string | null;
  healthStatus: BackupHealthStatus;
}

export type BackupJobState = "idle" | "backing-up" | "restoring";

export interface BackupJobStatus {
  state: BackupJobState;
  operation: "backup" | "restore" | null;
  startedAt: string | null;
  targetFile: string | null;
  progressMessage: string | null;
  error: string | null;
  completedAt: string | null;
  lastResult: "success" | "error" | null;
}

export type CreateAdminGroupRequest = import("@echolore/shared/contracts").CreateAdminGroupRequest;
export type UpdateAdminGroupRequest = import("@echolore/shared/contracts").UpdateAdminGroupRequest;

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  description: string | null;
  htmlLink: string | null;
}

export interface LivekitParticipantInfo {
  sid: string;
  identity: string;
  name: string;
  state: number;
  joinedAt?: number | string;
}
