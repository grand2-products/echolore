/**
 * API Client for corp-internal
 * Handles all communication with the backend API
 */

import type {
  AuthSessionDto,
  AuthMeResponseDto,
  PasswordRegistrationRequest,
  PasswordRegistrationResponse,
  BlockDto,
  CreateBlockRequest,
  CreateBlockResponse,
  CreateMeetingRequest,
  CreateMeetingResponse,
  CreatePageRequest,
  CreateSummaryRequest,
  CreateSummaryResponse,
  CreateTranscriptRequest,
  CreateTranscriptResponse,
  CreateUserRequest,
  ErrorResponse,
  FileMetadataDto,
  GetFileDownloadUrlResponse,
  GetFileResponse,
  GetMeetingResponse,
  GetPageResponse,
  GetUserResponse,
  GoogleTokenExchangeRequest,
  ListFilesResponse,
  ListAuthSessionsResponse,
  ListMeetingsResponse,
  ListPagesResponse,
  ListUsersResponse,
  LivekitCreateRoomRequest,
  LivekitTokenRequest,
  LivekitTokenResponse,
  MeetingDto,
  PageDto,
  SpaceDto,
  SuccessResponse,
  SummaryDto,
  TokenAuthResponse,
  TranscriptDto,
  UpdateBlockRequest,
  UpdateMeetingRequest,
  UpdatePageRequest,
  UpdateUserRequest,
  UploadFileResponse,
  SessionUserDto,
  UserDto,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from "@contracts/index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function normalizeApiBaseUrl(rawUrl: string | undefined) {
  const fallback = "http://localhost:3001/api";
  if (!rawUrl) {
    return fallback;
  }

  try {
    const url = new URL(rawUrl);
    const pathname = url.pathname.replace(/\/+$/, "");
    url.pathname = pathname.endsWith("/api") ? pathname : `${pathname}/api`;
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

const API_BASE = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
let refreshSessionPromise: Promise<boolean> | null = null;

function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

// ===========================================
// Types
// ===========================================

export type User = UserDto;
export type Page = PageDto;
export type Space = SpaceDto;
export type Block = BlockDto;
export type Meeting = MeetingDto;
export type Transcript = TranscriptDto;
export type Summary = SummaryDto;
export type FileMetadata = FileMetadataDto;
export type SessionUser = SessionUserDto;
export type AuthMeResponse = AuthMeResponseDto;
export type AuthSession = AuthSessionDto;

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

export interface SiteSettings {
  siteTitle: string;
  siteTagline: string;
  livekitMeetingSimulcast: boolean;
  livekitMeetingDynacast: boolean;
  livekitMeetingAdaptiveStream: boolean;
  livekitCoworkingSimulcast: boolean;
  livekitCoworkingDynacast: boolean;
  livekitCoworkingAdaptiveStream: boolean;
  hasSiteIcon: boolean;
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

export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: string;

  constructor(message: string, options: { status: number; code?: string; detail?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.detail = options.detail;
  }
}

export function isApiErrorStatus(error: unknown, status: number) {
  return error instanceof ApiError && error.status === status;
}

// ===========================================
// API Response Types
// ===========================================

// ===========================================
// Helper Functions
// ===========================================

async function parseApiError(response: Response) {
  const error = await response
    .json()
    .catch(
      (): ErrorResponse => ({ error: "Unknown error", code: "UNKNOWN_ERROR" })
    );

  return new ApiError(error.error || `HTTP error! status: ${response.status}`, {
    status: response.status,
    code: error.code,
    detail: error.message,
  });
}

function shouldAttemptSilentRefresh(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!normalizedPath.startsWith("/auth/")) {
    return true;
  }

  return normalizedPath === "/auth/me";
}

async function refreshPasswordSession() {
  if (!refreshSessionPromise) {
    refreshSessionPromise = fetch(
      API_BASE.replace(/\/api$/, "") + "/api/auth/session",
      { credentials: "include" },
    )
      .then(async (response) => {
        if (!response.ok) return false;
        const session = await response.json().catch(() => null);
        return Boolean(session?.user);
      })
      .catch(() => false)
      .finally(() => {
        refreshSessionPromise = null;
      });
  }

  return refreshSessionPromise;
}

async function executeApiRequest(path: string, options?: RequestInit, allowRefresh = true) {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    credentials: "include",
    headers: {
      ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });

  if (
    response.status === 401 &&
    allowRefresh &&
    shouldAttemptSilentRefresh(path) &&
    (await refreshPasswordSession())
  ) {
    return executeApiRequest(path, options, false);
  }

  return response;
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await executeApiRequest(path, options);

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return response.json();
}

/**
 * Generic fetch function for API calls (exported for backward compatibility)
 */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return fetchApi<T>(path, options);
}

// ===========================================
// Users API
// ===========================================

export const usersApi = {
  list: () => fetchApi<ListUsersResponse>("/users"),

  get: (id: string) => fetchApi<GetUserResponse>(`/users/${id}`),

  getByEmail: (email: string) =>
    fetchApi<GetUserResponse>(`/users/email/${encodeURIComponent(email)}`),

  listAuthSessions: () => fetchApi<ListAuthSessionsResponse>("/users/me/sessions"),

  revokeAuthSession: (id: string) =>
    fetchApi<SuccessResponse>(`/users/me/sessions/${id}`, {
      method: "DELETE",
    }),

  create: (data: CreateUserRequest) =>
    fetchApi<GetUserResponse>("/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateUserRequest) =>
    fetchApi<GetUserResponse>(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<SuccessResponse>(`/users/${id}`, {
      method: "DELETE",
    }),
};

export const authApi = {
  me: () => fetchApi<AuthMeResponse>("/auth/me"),
  registrationStatus: () => fetchApi<{ open: boolean }>("/auth/registration-status"),
  register: (data: PasswordRegistrationRequest) =>
    fetchApi<PasswordRegistrationResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  verifyEmail: (data: VerifyEmailRequest) =>
    fetchApi<VerifyEmailResponse>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  exchangeGoogleToken: (data: GoogleTokenExchangeRequest) =>
    fetchApi<TokenAuthResponse>("/auth/token/google", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  logout: () =>
    fetchApi<SuccessResponse>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    }),
};

// ===========================================
// Wiki API
// ===========================================

export const wikiApi = {
  listSpaces: () => fetchApi<{ spaces: Space[] }>("/wiki/spaces"),

  getOrCreatePersonalSpace: () =>
    fetchApi<{ space: Space }>("/wiki/spaces/personal", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  listPages: () => fetchApi<ListPagesResponse>("/wiki"),

  searchPages: (query: string, options?: { semantic?: boolean }) => {
    const semantic = options?.semantic ?? true;
    return fetchApi<WikiSearchResponse>(
      `/wiki/search?q=${encodeURIComponent(query)}&semantic=${semantic ? "1" : "0"}`
    );
  },

  getPage: (id: string) => fetchApi<GetPageResponse>(`/wiki/${id}`),

  createPage: (data: CreatePageRequest) =>
    fetchApi<{ page: Page }>("/wiki", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updatePage: (id: string, data: UpdatePageRequest) =>
    fetchApi<{ page: Page }>(`/wiki/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deletePage: (id: string) =>
    fetchApi<SuccessResponse>(`/wiki/${id}`, {
      method: "DELETE",
    }),

  createBlock: (data: CreateBlockRequest) =>
    fetchApi<CreateBlockResponse>("/wiki/blocks", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteBlock: (id: string) =>
    fetchApi<SuccessResponse>(`/wiki/blocks/${id}`, {
      method: "DELETE",
    }),

  updateBlock: (id: string, data: UpdateBlockRequest) =>
    fetchApi<CreateBlockResponse>(`/wiki/blocks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

// ===========================================
// Wiki Chat API
// ===========================================

export interface WikiChatConversation {
  id: string;
  title: string;
  creatorId: string;
  creatorName?: string | null;
  visibility: "team" | "private";
  messageCount?: number;
  lastMessagePreview?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WikiChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations: Array<{ pageId: string; pageTitle: string; snippet?: string }> | null;
  createdAt: string;
}

export const wikiChatApi = {
  listConversations: (opts?: { mine?: boolean; query?: string }) => {
    const params = new URLSearchParams();
    if (opts?.mine) params.set("mine", "1");
    if (opts?.query) params.set("q", opts.query);
    const qs = params.toString();
    return fetchApi<{ conversations: WikiChatConversation[] }>(`/wiki-chat${qs ? `?${qs}` : ""}`);
  },

  createConversation: (data?: { title?: string; visibility?: "team" | "private" }) =>
    fetchApi<{ conversation: WikiChatConversation }>("/wiki-chat", {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    }),

  getConversation: (id: string) =>
    fetchApi<{ conversation: WikiChatConversation; messages: WikiChatMessage[] }>(`/wiki-chat/${id}`),

  updateConversation: (id: string, data: { title?: string; visibility?: "team" | "private" }) =>
    fetchApi<{ conversation: WikiChatConversation }>(`/wiki-chat/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteConversation: (id: string) =>
    fetchApi<{ success: boolean }>(`/wiki-chat/${id}`, {
      method: "DELETE",
    }),

  sendMessage: (conversationId: string, content: string) =>
    fetchApi<{ userMessage: WikiChatMessage; assistantMessage: WikiChatMessage }>(
      `/wiki-chat/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      }
    ),
};

// ===========================================
// Meetings API
// ===========================================

export const meetingsApi = {
  list: () => fetchApi<ListMeetingsResponse>("/meetings"),

  get: (id: string) => fetchApi<GetMeetingResponse>(`/meetings/${id}`),

  create: (data: CreateMeetingRequest) =>
    fetchApi<CreateMeetingResponse>("/meetings", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateMeetingRequest) =>
    fetchApi<CreateMeetingResponse>(`/meetings/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<SuccessResponse>(`/meetings/${id}`, {
      method: "DELETE",
    }),

  addTranscript: (id: string, data: CreateTranscriptRequest) =>
    fetchApi<CreateTranscriptResponse>(`/meetings/${id}/transcripts`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  addSummary: (id: string, data: CreateSummaryRequest) =>
    fetchApi<CreateSummaryResponse>(`/meetings/${id}/summaries`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  runRoomAiPipeline: (id: string, data?: { title?: string }) =>
    fetchApi<RunRoomAiPipelineResponse>(`/meetings/${id}/pipeline/run`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    }),

  listRealtimeTranscripts: (id: string) =>
    fetchApi<{ segments: RealtimeTranscriptSegment[] }>(`/meetings/${id}/realtime/transcripts`),

  addRealtimeTranscript: (
    id: string,
    data: {
      participantIdentity: string;
      speakerUserId?: string | null;
      speakerLabel: string;
      content: string;
      isPartial: boolean;
      segmentKey: string;
      provider: "google" | "zhipu";
      confidence?: number | null;
      startedAt: string;
      finalizedAt?: string | null;
    }
  ) =>
    fetchApi<{ segment: RealtimeTranscriptSegment }>(`/meetings/${id}/realtime/transcripts`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listAgentEvents: (id: string) =>
    fetchApi<{ events: MeetingAgentEvent[] }>(`/meetings/${id}/agent-events`),

  listActiveAgentSessions: (id: string) =>
    fetchApi<{ sessions: MeetingAgentSession[] }>(`/meetings/${id}/agents/active`),

  invokeAgent: (id: string, agentId: string) =>
    fetchApi<{
      agent: AgentDefinition;
      session: { id: string; state: string; joinedAt: string | null };
      reused: boolean;
    }>(`/meetings/${id}/agents/${agentId}/invoke`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  leaveAgent: (id: string, agentId: string) =>
    fetchApi<{ session: { id: string; state: string; leftAt: string | null } }>(
      `/meetings/${id}/agents/${agentId}/leave`,
      {
        method: "POST",
        body: JSON.stringify({}),
      }
    ),

  respondAsAgent: (id: string, agentId: string, data: { prompt: string; languageCode?: string }) =>
    fetchApi<MeetingAgentResponse>(`/meetings/${id}/agents/${agentId}/respond`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listRecordings: (id: string) =>
    fetchApi<{ recordings: MeetingRecording[] }>(`/meetings/${id}/recordings`),

  getRecordingDownloadUrl: (meetingId: string, recordingId: string) =>
    buildApiUrl(`/meetings/${encodeURIComponent(meetingId)}/recordings/${encodeURIComponent(recordingId)}/download`),
};

// ===========================================
// Calendar API
// ===========================================

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  description: string | null;
  htmlLink: string | null;
}

export const calendarApi = {
  status: () => fetchApi<{ connected: boolean }>("/calendar/status"),

  getConnectUrl: () => buildApiUrl("/calendar/connect"),

  disconnect: () =>
    fetchApi<{ success: boolean }>("/calendar/disconnect", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  listEvents: (days?: number) =>
    fetchApi<{ events: CalendarEvent[] }>(`/calendar/events${days ? `?days=${days}` : ""}`),

  importEvent: (eventId: string) =>
    fetchApi<{ meeting: Meeting }>(`/calendar/events/${encodeURIComponent(eventId)}/import`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};

export const metricsApi = {
  getOverview: (windowDays = 30) =>
    fetchApi<KpiOverviewResponse>(`/admin/metrics/overview?windowDays=${windowDays}`),
};

export const adminApi = {
  listGroups: () => fetchApi<{ groups: AdminGroup[] }>("/admin/groups"),

  getGroup: (id: string) => fetchApi<{ group: AdminGroupDetail }>(`/admin/groups/${id}`),

  createGroup: (data: CreateAdminGroupRequest) =>
    fetchApi<{ group: AdminGroup }>("/admin/groups", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateGroup: (id: string, data: UpdateAdminGroupRequest) =>
    fetchApi<{ group: AdminGroup }>(`/admin/groups/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteGroup: (id: string) =>
    fetchApi<SuccessResponse>(`/admin/groups/${id}`, {
      method: "DELETE",
    }),

  listUsers: () => fetchApi<{ users: AdminUserRecord[] }>("/admin/users"),

  updateUserRole: (id: string, role: "admin" | "member") =>
    fetchApi<{ user: AdminUserRecord }>(`/admin/users/${id}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),

  updateUserGroups: (id: string, groupIds: string[]) =>
    fetchApi<{ success: boolean; groupIds: string[] }>(`/admin/users/${id}/groups`, {
      method: "PUT",
      body: JSON.stringify({ groupIds }),
    }),

  getPagePermissions: (pageId: string) =>
    fetchApi<AdminPagePermissionsResponse>(`/admin/permissions/pages/${pageId}`),

  setPagePermissions: (
    pageId: string,
    data: {
      inheritFromParent?: boolean;
      permissions: Array<{
        groupId: string;
        canRead: boolean;
        canWrite: boolean;
        canDelete: boolean;
      }>;
    }
  ) =>
    fetchApi<{ pageId: string; inheritFromParent: boolean }>(`/admin/permissions/pages/${pageId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  listAgents: () => fetchApi<{ agents: AgentDefinition[] }>("/admin/agents"),

  createAgent: (data: CreateAgentRequest) =>
    fetchApi<{ agent: AgentDefinition }>("/admin/agents", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateAgent: (id: string, data: UpdateAgentRequest) =>
    fetchApi<{ agent: AgentDefinition }>(`/admin/agents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getSiteSettings: () => fetchApi<SiteSettings>("/admin/settings"),

  updateSiteSettings: (data: UpdateSiteSettingsRequest) =>
    fetchApi<Partial<SiteSettings>>("/admin/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getEmailSettings: () => fetchApi<EmailSettings>("/admin/email-settings"),

  updateEmailSettings: (data: UpdateEmailSettingsRequest) =>
    fetchApi<EmailSettings>("/admin/email-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getLlmSettings: () => fetchApi<LlmSettings>("/admin/llm-settings"),

  updateLlmSettings: (data: UpdateLlmSettingsRequest) =>
    fetchApi<LlmSettings>("/admin/llm-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  testLlmConnection: () =>
    fetchApi<{ ok: boolean; reply?: string; error?: string }>("/admin/llm-settings/test", {
      method: "POST",
    }),

  getStorageSettings: () => fetchApi<StorageSettings>("/admin/storage-settings"),

  updateStorageSettings: (data: UpdateStorageSettingsRequest) =>
    fetchApi<StorageSettings>("/admin/storage-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  testStorageConnection: () =>
    fetchApi<{ ok: boolean; provider?: string; error?: string }>("/admin/storage-settings/test", {
      method: "POST",
    }),

  uploadSiteIcon: async (file: File): Promise<{ success: boolean }> => {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const response = await executeApiRequest("/admin/site-icon", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    return response.json();
  },

  deleteSiteIcon: () =>
    fetchApi<{ success: boolean }>("/admin/site-icon", {
      method: "DELETE",
    }),
};

// ===========================================
// Site Settings API (public, no auth)
// ===========================================

export const siteSettingsApi = {
  get: async (): Promise<SiteSettings> => {
    const response = await fetch(buildApiUrl("/site-settings"), { credentials: "include" });
    if (!response.ok) {
      throw new ApiError("Failed to fetch site settings", { status: response.status });
    }
    return response.json();
  },
};

// ===========================================
// LiveKit API
// ===========================================

export const livekitApi = {
  getToken: (data: LivekitTokenRequest) =>
    fetchApi<LivekitTokenResponse>("/livekit/token", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listRooms: () => fetchApi<{ rooms: unknown[] }>("/livekit/rooms"),

  createRoom: (data: LivekitCreateRoomRequest) =>
    fetchApi<{ room: unknown }>("/livekit/rooms", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteRoom: (name: string) =>
    fetchApi<{ success: boolean }>(`/livekit/rooms/${name}`, {
      method: "DELETE",
    }),

  listParticipants: (roomName: string) =>
    fetchApi<{ participants: unknown[] }>(`/livekit/rooms/${roomName}/participants`),

  startRecording: (roomName: string, meetingId: string) =>
    fetchApi<{ egressId: string; recording: unknown }>(`/livekit/rooms/${roomName}/start-recording`, {
      method: "POST",
      body: JSON.stringify({ meetingId }),
    }),

  stopRecording: (roomName: string, egressId: string) =>
    fetchApi<{ success: boolean }>(`/livekit/rooms/${roomName}/stop-recording`, {
      method: "POST",
      body: JSON.stringify({ egressId }),
    }),

  getRecordingStatus: (roomName: string, meetingId: string) =>
    fetchApi<{ recordings: Array<{ id: string; egressId: string; status: string; startedAt: string | null }> }>(
      `/livekit/rooms/${roomName}/recording-status?meetingId=${meetingId}`,
    ),
};

// ===========================================
// Files API
// ===========================================

export const filesApi = {
  list: () => fetchApi<ListFilesResponse>("/files"),

  get: (id: string) => fetchApi<GetFileResponse>(`/files/${id}`),

  getDownloadUrl: (id: string) => fetchApi<GetFileDownloadUrlResponse>(`/files/${id}/download`),

  upload: async (file: File): Promise<UploadFileResponse> => {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const response = await executeApiRequest("/files/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    return response.json();
  },

  delete: (id: string) =>
    fetchApi<SuccessResponse>(`/files/${id}`, {
      method: "DELETE",
    }),
};

export function getSiteIconUrl() {
  return buildApiUrl("/site-icon");
}

export function getWikiFileDownloadUrl(pageId: string, fileId: string) {
  return buildApiUrl(`/wiki/${encodeURIComponent(pageId)}/files/${encodeURIComponent(fileId)}/download`);
}

// ===========================================
// React Query Hooks
// ===========================================

const queryKeys = {
  authMe: ["auth", "me"] as const,
  users: ["users"] as const,
  meetings: ["meetings"] as const,
  meeting: (id: string) => ["meetings", id] as const,
  wikiSpaces: ["wiki", "spaces"] as const,
  wikiPages: ["wiki", "pages"] as const,
  wikiPage: (id: string) => ["wiki", "pages", id] as const,
  wikiChatConversations: ["wiki-chat", "conversations"] as const,
  wikiChatConversation: (id: string) => ["wiki-chat", "conversations", id] as const,
};

export function useAuthMeQuery() {
  return useQuery({
    queryKey: queryKeys.authMe,
    queryFn: () => authApi.me(),
    retry: false,
  });
}

export function useMeetingsQuery() {
  return useQuery({
    queryKey: queryKeys.meetings,
    queryFn: () => meetingsApi.list(),
  });
}

export function useCreateMeetingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meetingsApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.meetings });
    },
  });
}

export function useSpacesQuery() {
  return useQuery({
    queryKey: queryKeys.wikiSpaces,
    queryFn: () => wikiApi.listSpaces(),
  });
}

export function useWikiPagesQuery() {
  return useQuery({
    queryKey: queryKeys.wikiPages,
    queryFn: () => wikiApi.listPages(),
  });
}

export function useWikiPageQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.wikiPage(id),
    queryFn: () => wikiApi.getPage(id),
    enabled: Boolean(id),
  });
}

export function useWikiChatConversationsQuery(opts?: { mine?: boolean; query?: string }) {
  return useQuery({
    queryKey: [...queryKeys.wikiChatConversations, opts],
    queryFn: () => wikiChatApi.listConversations(opts),
  });
}

export function useWikiChatConversationQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.wikiChatConversation(id),
    queryFn: () => wikiChatApi.getConversation(id),
    enabled: Boolean(id),
  });
}

export function useCreateWikiChatConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wikiChatApi.createConversation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.wikiChatConversations });
    },
  });
}

export function useCalendarStatusQuery(enabled = true) {
  return useQuery({
    queryKey: ["calendar", "status"] as const,
    queryFn: () => calendarApi.status(),
    enabled,
  });
}

export function useCalendarEventsQuery(days?: number, enabled = true) {
  return useQuery({
    queryKey: ["calendar", "events", days] as const,
    queryFn: () => calendarApi.listEvents(days),
    enabled,
  });
}

export function useSendWikiChatMessageMutation(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => wikiChatApi.sendMessage(conversationId, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.wikiChatConversation(conversationId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.wikiChatConversations });
    },
  });
}

