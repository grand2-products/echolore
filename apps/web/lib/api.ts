/**
 * API Client for corp-internal
 * Handles all communication with the backend API
 */

import type {
  AuthSessionDto,
  AuthMeResponseDto,
  PasswordAuthResponse,
  PasswordLoginRequest,
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

function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

// ===========================================
// Types
// ===========================================

export type User = UserDto;
export type Page = PageDto;
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
  defaultProvider: "google";
  isActive?: boolean;
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

// ===========================================
// API Response Types
// ===========================================

// ===========================================
// Helper Functions
// ===========================================

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(
        (): ErrorResponse => ({ error: "Unknown error", code: "UNKNOWN_ERROR" })
      );
    throw new ApiError(error.error || `HTTP error! status: ${response.status}`, {
      status: response.status,
      code: error.code,
      detail: error.message,
    });
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
  login: (data: PasswordLoginRequest) =>
    fetchApi<PasswordAuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
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
      provider: "google";
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

    const response = await fetch(buildApiUrl("/files/upload"), {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(
          (): ErrorResponse => ({ error: "Unknown error", code: "UNKNOWN_ERROR" })
        );
      throw new ApiError(error.error || `HTTP error! status: ${response.status}`, {
        status: response.status,
        code: error.code,
        detail: error.message,
      });
    }

    return response.json();
  },

  delete: (id: string) =>
    fetchApi<SuccessResponse>(`/files/${id}`, {
      method: "DELETE",
    }),
};

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
  wikiPages: ["wiki", "pages"] as const,
  wikiPage: (id: string) => ["wiki", "pages", id] as const,
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
