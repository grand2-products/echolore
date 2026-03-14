import type {
  CreateMeetingRequest,
  CreateMeetingResponse,
  CreateSummaryRequest,
  CreateSummaryResponse,
  CreateTranscriptRequest,
  CreateTranscriptResponse,
  GetMeetingResponse,
  ListMeetingsResponse,
  LivekitCreateRoomRequest,
  LivekitTokenRequest,
  LivekitTokenResponse,
  SuccessResponse,
  UpdateMeetingRequest,
} from "@contracts/index";
import { buildApiUrl, fetchApi } from "./fetch";
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
