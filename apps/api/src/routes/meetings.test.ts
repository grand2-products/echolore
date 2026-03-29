import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, memberUser } from "../test-utils/index.js";
import { meetingsRoutes } from "./meetings/index.js";

const {
  createMeetingMock,
  createSummaryMock,
  createTranscriptMock,
  deleteMeetingMock,
  generateMeetingSummaryMock,
  getExistingRoomAiPipelineResultMock,
  getMeetingByIdMock,
  getMeetingSummariesMock,
  getMeetingTranscriptsMock,
  invokeMeetingAgentMock,
  leaveMeetingAgentMock,
  listActiveAgentSessionsMock,
  listAllMeetingsMock,
  listMeetingsByUserMock,
  listMeetingAgentTimelineMock,
  listRealtimeTranscriptSegmentsMock,
  updateMeetingMock,
  upsertTranscriptSegmentMock,
  createMeetingSummaryWikiArtifactsMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  createMeetingMock: vi.fn(),
  createSummaryMock: vi.fn(),
  createTranscriptMock: vi.fn(),
  deleteMeetingMock: vi.fn(),
  generateMeetingSummaryMock: vi.fn(),
  getExistingRoomAiPipelineResultMock: vi.fn(),
  getMeetingByIdMock: vi.fn(),
  getMeetingSummariesMock: vi.fn(),
  getMeetingTranscriptsMock: vi.fn(),
  invokeMeetingAgentMock: vi.fn(),
  leaveMeetingAgentMock: vi.fn(),
  listActiveAgentSessionsMock: vi.fn(),
  listAllMeetingsMock: vi.fn(),
  listMeetingsByUserMock: vi.fn(),
  listMeetingAgentTimelineMock: vi.fn(),
  listRealtimeTranscriptSegmentsMock: vi.fn(),
  updateMeetingMock: vi.fn(),
  upsertTranscriptSegmentMock: vi.fn(),
  createMeetingSummaryWikiArtifactsMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("../services/meeting/meeting-service.js", () => ({
  createMeeting: createMeetingMock,
  createSummary: createSummaryMock,
  createTranscript: createTranscriptMock,
  deleteMeeting: deleteMeetingMock,
  getMeetingById: getMeetingByIdMock,
  getMeetingSummaries: getMeetingSummariesMock,
  getMeetingTranscripts: getMeetingTranscriptsMock,
  listAllMeetings: listAllMeetingsMock,
  listMeetingsByUser: listMeetingsByUserMock,
  updateMeeting: updateMeetingMock,
  createMeetingSummaryWikiArtifacts: createMeetingSummaryWikiArtifactsMock,
  getExistingRoomAiPipelineResult: getExistingRoomAiPipelineResultMock,
}));

vi.mock("../services/meeting/meeting-realtime-service.js", () => ({
  invokeMeetingAgent: invokeMeetingAgentMock,
  leaveMeetingAgent: leaveMeetingAgentMock,
  listActiveAgentSessions: listActiveAgentSessionsMock,
  listMeetingAgentTimeline: listMeetingAgentTimelineMock,
  listRealtimeTranscriptSegments: listRealtimeTranscriptSegmentsMock,
  upsertTranscriptSegment: upsertTranscriptSegmentMock,
}));

vi.mock("../ai/meeting-summary.js", () => ({
  generateMeetingSummary: generateMeetingSummaryMock,
}));

vi.mock("../lib/audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
  auditAction: vi.fn(),
  extractRequestMeta: vi.fn(() => ({ ipAddress: null, userAgent: null })),
}));

vi.mock("../services/calendar/google-calendar-sync-service.js", () => ({
  syncMeetingToCalendar: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));

vi.mock("../services/meeting/recording-service.js", () => ({
  getRecordingStatus: vi.fn().mockResolvedValue([]),
}));

vi.mock("../lib/file-storage.js", () => ({
  loadFile: vi.fn(),
}));

vi.mock("../services/meeting/meeting-agent-runtime-service.js", () => ({
  generateMeetingAgentResponse: vi.fn(),
}));

function createApp(user: ReturnType<typeof memberUser>) {
  return createTestApp("/api/meetings", meetingsRoutes, user);
}

describe("meetingsRoutes", () => {
  beforeEach(() => {
    createMeetingMock.mockReset();
    createSummaryMock.mockReset();
    createTranscriptMock.mockReset();
    deleteMeetingMock.mockReset();
    generateMeetingSummaryMock.mockReset();
    getExistingRoomAiPipelineResultMock.mockReset();
    getMeetingByIdMock.mockReset();
    getMeetingSummariesMock.mockReset();
    getMeetingTranscriptsMock.mockReset();
    invokeMeetingAgentMock.mockReset();
    leaveMeetingAgentMock.mockReset();
    listActiveAgentSessionsMock.mockReset();
    listAllMeetingsMock.mockReset();
    listMeetingsByUserMock.mockReset();
    listMeetingAgentTimelineMock.mockReset();
    listRealtimeTranscriptSegmentsMock.mockReset();
    updateMeetingMock.mockReset();
    upsertTranscriptSegmentMock.mockReset();
    createMeetingSummaryWikiArtifactsMock.mockReset();
    writeAuditLogMock.mockReset();
  });

  it("returns meeting detail DTOs with ISO timestamps for the owner", async () => {
    const app = createApp(memberUser({ email: "owner@example.com", name: "Owner" }));

    getMeetingByIdMock.mockResolvedValue({
      id: "meeting_1",
      title: "Planning",
      creator_id: "user_1",
      room_name: "room-1",
      status: "scheduled",
      started_at: new Date("2026-03-11T10:00:00.000Z"),
      ended_at: null,
      scheduled_at: null,
      google_calendar_event_id: null,
      created_at: new Date("2026-03-11T09:00:00.000Z"),
    });
    getMeetingTranscriptsMock.mockResolvedValue([
      {
        id: "transcript_1",
        meeting_id: "meeting_1",
        speaker_id: "speaker_1",
        content: "Hello",
        timestamp: new Date("2026-03-11T10:05:00.000Z"),
        created_at: new Date("2026-03-11T10:05:01.000Z"),
      },
    ]);
    getMeetingSummariesMock.mockResolvedValue([
      {
        id: "summary_1",
        meeting_id: "meeting_1",
        content: "Summary",
        created_at: new Date("2026-03-11T10:10:00.000Z"),
      },
    ]);

    const response = await app.request("http://localhost/api/meetings/meeting_1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      meeting: {
        id: "meeting_1",
        title: "Planning",
        creatorId: "user_1",
        roomName: "room-1",
        status: "scheduled",
        startedAt: "2026-03-11T10:00:00.000Z",
        endedAt: null,
        scheduledAt: null,
        googleCalendarEventId: null,
        createdAt: "2026-03-11T09:00:00.000Z",
      },
      transcripts: [
        {
          id: "transcript_1",
          meetingId: "meeting_1",
          speakerId: "speaker_1",
          content: "Hello",
          timestamp: "2026-03-11T10:05:00.000Z",
          createdAt: "2026-03-11T10:05:01.000Z",
        },
      ],
      summaries: [
        {
          id: "summary_1",
          meetingId: "meeting_1",
          content: "Summary",
          createdAt: "2026-03-11T10:10:00.000Z",
        },
      ],
    });
  });

  it("rejects meeting detail access for non-owners", async () => {
    const app = createApp(memberUser({ id: "user_2" }));

    getMeetingByIdMock.mockResolvedValue({
      id: "meeting_1",
      title: "Planning",
      creator_id: "user_1",
      room_name: "room-1",
      status: "scheduled",
      started_at: null,
      ended_at: null,
      created_at: new Date("2026-03-11T09:00:00.000Z"),
    });

    const response = await app.request("http://localhost/api/meetings/meeting_1");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "MEETING_FORBIDDEN",
      error: "Forbidden",
    });
    expect(getMeetingTranscriptsMock).not.toHaveBeenCalled();
    expect(getMeetingSummariesMock).not.toHaveBeenCalled();
  });

  it("ignores client-supplied creatorId and uses the session user for meeting creation", async () => {
    const app = createApp(memberUser({ email: "owner@example.com", name: "Owner" }));

    createMeetingMock.mockImplementation(async (input) => ({
      id: input.id,
      title: input.title,
      creator_id: input.creatorId,
      room_name: input.roomName,
      status: input.status,
      started_at: null,
      ended_at: null,
      scheduled_at: input.scheduledAt ?? null,
      google_calendar_event_id: null,
      created_at: input.createdAt,
    }));

    const response = await app.request("http://localhost/api/meetings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Planning",
        creatorId: "spoofed_user",
      }),
    });

    expect(response.status).toBe(201);
    expect(createMeetingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorId: "user_1",
        title: "Planning",
      })
    );
    expect(createMeetingMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        creatorId: "spoofed_user",
      })
    );
  });

  it("returns active agent sessions for authorized meeting readers", async () => {
    const app = createApp(memberUser({ email: "owner@example.com", name: "Owner" }));

    getMeetingByIdMock.mockResolvedValue({
      id: "meeting_1",
      title: "Planning",
      creator_id: "user_1",
      room_name: "room-1",
      status: "active",
      started_at: new Date("2026-03-12T09:00:00.000Z"),
      ended_at: null,
      created_at: new Date("2026-03-12T08:50:00.000Z"),
    });
    listActiveAgentSessionsMock.mockResolvedValue([
      {
        id: "session_1",
        meetingId: "meeting_1",
        agentId: "agent_1",
        state: "active",
        invokedByUserId: "user_1",
        joinedAt: new Date("2026-03-12T09:05:00.000Z"),
        leftAt: null,
        createdAt: new Date("2026-03-12T09:05:00.000Z"),
      },
    ]);

    const response = await app.request("http://localhost/api/meetings/meeting_1/agents/active");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessions: [
        {
          id: "session_1",
          meetingId: "meeting_1",
          agentId: "agent_1",
          state: "active",
          invokedByUserId: "user_1",
          joinedAt: "2026-03-12T09:05:00.000Z",
          leftAt: null,
          createdAt: "2026-03-12T09:05:00.000Z",
        },
      ],
    });
  });

  it("rejects active agent session access for non-owners", async () => {
    const app = createApp(memberUser({ id: "user_2" }));

    getMeetingByIdMock.mockResolvedValue({
      id: "meeting_1",
      title: "Planning",
      creator_id: "user_1",
      room_name: "room-1",
      status: "active",
      started_at: null,
      ended_at: null,
      created_at: new Date("2026-03-12T08:50:00.000Z"),
    });

    const response = await app.request("http://localhost/api/meetings/meeting_1/agents/active");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "MEETING_FORBIDDEN",
      error: "Forbidden",
    });
    expect(listActiveAgentSessionsMock).not.toHaveBeenCalled();
  });

  it("rejects agent invocation for non-writers", async () => {
    const app = createApp(memberUser({ id: "user_2" }));

    getMeetingByIdMock.mockResolvedValue({
      id: "meeting_1",
      title: "Planning",
      creator_id: "user_1",
      room_name: "room-1",
      status: "active",
      started_at: null,
      ended_at: null,
      created_at: new Date("2026-03-12T08:50:00.000Z"),
    });

    const response = await app.request(
      "http://localhost/api/meetings/meeting_1/agents/agent_1/invoke",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "MEETING_FORBIDDEN",
      error: "Forbidden",
    });
    expect(invokeMeetingAgentMock).not.toHaveBeenCalled();
  });

  it("allows meeting writers to leave an active agent session", async () => {
    const app = createApp(memberUser({ email: "owner@example.com", name: "Owner" }));

    getMeetingByIdMock.mockResolvedValue({
      id: "meeting_1",
      title: "Planning",
      creator_id: "user_1",
      room_name: "room-1",
      status: "active",
      started_at: null,
      ended_at: null,
      created_at: new Date("2026-03-12T08:50:00.000Z"),
    });
    leaveMeetingAgentMock.mockResolvedValue({
      id: "session_1",
      meetingId: "meeting_1",
      agentId: "agent_1",
      state: "ended",
      invokedByUserId: "user_1",
      joinedAt: new Date("2026-03-12T09:05:00.000Z"),
      leftAt: new Date("2026-03-12T09:08:00.000Z"),
      createdAt: new Date("2026-03-12T09:05:00.000Z"),
    });

    const response = await app.request(
      "http://localhost/api/meetings/meeting_1/agents/agent_1/leave",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      session: {
        id: "session_1",
        meetingId: "meeting_1",
        agentId: "agent_1",
        state: "ended",
        invokedByUserId: "user_1",
        joinedAt: "2026-03-12T09:05:00.000Z",
        leftAt: "2026-03-12T09:08:00.000Z",
        createdAt: "2026-03-12T09:05:00.000Z",
      },
    });
    expect(leaveMeetingAgentMock).toHaveBeenCalledWith({
      meetingId: "meeting_1",
      agentId: "agent_1",
      triggeredByUserId: "user_1",
    });
  });
});
