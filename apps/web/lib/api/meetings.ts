import type {
  CreateMeetingInviteRequest,
  CreateMeetingRequest,
  CreateMeetingResponse,
  CreateSummaryRequest,
  CreateSummaryResponse,
  CreateTranscriptRequest,
  CreateTranscriptResponse,
  GetMeetingResponse,
  GuestJoinRequestResponse,
  GuestRequestStatusResponse,
  ListMeetingsResponse,
  LivekitCreateRoomRequest,
  LivekitTokenRequest,
  LivekitTokenResponse,
  MeetingGuestRequestDto,
  MeetingInviteDto,
  SuccessResponse,
  UpdateMeetingRequest,
  ValidateInviteResponse,
} from "@echolore/shared/contracts";
import { buildApiUrl, fetchApi, fetchPublic } from "./fetch";
import type {
  AgentDefinition,
  LivekitParticipantInfo,
  MeetingAgentEvent,
  MeetingAgentResponse,
  MeetingAgentSession,
  MeetingRecording,
  RealtimeTranscriptSegment,
  RunRoomAiPipelineResponse,
} from "./types";

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

  endForAll: (id: string) =>
    fetchApi<{ meeting: unknown }>(`/meetings/${id}/end`, {
      method: "POST",
      body: JSON.stringify({}),
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
    buildApiUrl(
      `/meetings/${encodeURIComponent(meetingId)}/recordings/${encodeURIComponent(recordingId)}/download`
    ),

  // Invite management (authenticated)
  createInvite: (meetingId: string, data: CreateMeetingInviteRequest) =>
    fetchApi<{ invite: MeetingInviteDto }>(`/meetings/${meetingId}/invites`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listInvites: (meetingId: string) =>
    fetchApi<{ invites: MeetingInviteDto[] }>(`/meetings/${meetingId}/invites`),

  revokeInvite: (meetingId: string, inviteId: string) =>
    fetchApi<SuccessResponse>(`/meetings/${meetingId}/invites/${inviteId}`, {
      method: "DELETE",
    }),

  listGuestRequests: (meetingId: string) =>
    fetchApi<{ requests: MeetingGuestRequestDto[] }>(`/meetings/${meetingId}/guest-requests`),

  approveGuestRequest: (meetingId: string, requestId: string) =>
    fetchApi<SuccessResponse>(`/meetings/${meetingId}/guest-requests/${requestId}/approve`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  rejectGuestRequest: (meetingId: string, requestId: string) =>
    fetchApi<SuccessResponse>(`/meetings/${meetingId}/guest-requests/${requestId}/reject`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};

// Public guest API (no auth required)
export const guestApi = {
  validateInvite: (token: string) => fetchPublic<ValidateInviteResponse>(`/meetings/join/${token}`),

  submitJoinRequest: (token: string, guestName: string) =>
    fetchPublic<GuestJoinRequestResponse>(`/meetings/join/${token}/request`, {
      method: "POST",
      body: JSON.stringify({ guestName }),
    }),

  checkRequestStatus: (token: string, requestId: string) =>
    fetchPublic<GuestRequestStatusResponse>(`/meetings/join/${token}/request/${requestId}/status`),
};

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
    fetchApi<{ participants: LivekitParticipantInfo[] }>(`/livekit/rooms/${roomName}/participants`),

  startRecording: (roomName: string, meetingId: string) =>
    fetchApi<{ egressId: string; recording: unknown }>(
      `/livekit/rooms/${roomName}/start-recording`,
      {
        method: "POST",
        body: JSON.stringify({ meetingId }),
      }
    ),

  stopRecording: (roomName: string, egressId: string) =>
    fetchApi<{ success: boolean }>(`/livekit/rooms/${roomName}/stop-recording`, {
      method: "POST",
      body: JSON.stringify({ egressId }),
    }),

  getRecordingStatus: (roomName: string, meetingId: string) =>
    fetchApi<{
      recordings: Array<{ id: string; egressId: string; status: string; startedAt: string | null }>;
    }>(`/livekit/rooms/${roomName}/recording-status?meetingId=${meetingId}`),
};
