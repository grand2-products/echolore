/**
 * API type aliases and interfaces used across the API client.
 */

import type {
  AiChatConversationDto,
  AiChatMessageDto,
  AuthMeResponseDto,
  AuthSessionDto,
  BlockDto,
  FileMetadataDto,
  MeetingDto,
  PageDto,
  PageRevisionDto,
  SessionUserDto,
  SpaceDto,
  SummaryDto,
  TranscriptDto,
  UserDto,
} from "@corp-internal/shared/contracts";

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

export interface RealtimeTranscriptSegment {
  id: string;
  meetingId: string;
  participantIdentity: string;
  speakerUserId: string | null;
  speakerLabel: string;
  content: string;
  isPartial: boolean;
  segmentKey: string;
  provider: string;
  confidence: number | null;
  startedAt: string;
  finalizedAt: string | null;
  createdAt: string;
}

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

export interface AdminGroup {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  memberCount: number;
}

export interface AdminGroupDetail extends Omit<AdminGroup, "memberCount"> {
  members: string[];
}

export interface AdminUserGroupRef {
  id: string;
  name: string;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  role: "admin" | "member";
  createdAt: string;
  updatedAt: string;
  groups: AdminUserGroupRef[];
}

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

export interface AdminSpacePermissionRecord {
  id: string;
  spaceId: string;
  groupId: string;
  groupName?: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSpacePermissionsResponse {
  spaceId: string;
  permissions: AdminSpacePermissionRecord[];
}

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
  embeddingModel: string | null;
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
  embeddingModel?: string | null;
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

export interface CreateAdminGroupRequest {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateAdminGroupRequest {
  name?: string;
  description?: string;
  permissions?: string[];
}

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
