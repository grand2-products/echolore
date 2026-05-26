import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getMeetingByRoomNameMock,
  endMeetingIfNotEndedMock,
  closeAllParticipantSessionsMock,
  closeActiveMeetingAgentSessionsMock,
  writeAuditLogMock,
  updateCalendarEventMock,
  deleteRoomMock,
} = vi.hoisted(() => ({
  getMeetingByRoomNameMock: vi.fn(),
  endMeetingIfNotEndedMock: vi.fn(),
  closeAllParticipantSessionsMock: vi.fn(),
  closeActiveMeetingAgentSessionsMock: vi.fn(),
  writeAuditLogMock: vi.fn().mockResolvedValue(undefined),
  updateCalendarEventMock: vi.fn(),
  deleteRoomMock: vi.fn(),
}));

vi.mock("../../repositories/meeting/meeting-repository.js", () => ({
  getMeetingByRoomName: getMeetingByRoomNameMock,
  endMeetingIfNotEnded: endMeetingIfNotEndedMock,
  closeAllParticipantSessions: closeAllParticipantSessionsMock,
  updateMeeting: vi.fn(),
  // Unused by endMeetingByRoomName but imported/re-exported by meeting-service.
  createMeetingSummaryArtifactsTx: vi.fn(),
  ensureMeetingNotesPage: vi.fn(),
  getLatestMeetingSummary: vi.fn(),
  getRoomAiWikiPageByMeetingId: vi.fn(),
}));

vi.mock("../../repositories/meeting/meeting-realtime-repository.js", () => ({
  closeActiveMeetingAgentSessions: closeActiveMeetingAgentSessionsMock,
}));

vi.mock("../../lib/audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("../../lib/livekit-client.js", () => ({
  roomService: { deleteRoom: deleteRoomMock },
}));

vi.mock("../calendar/google-calendar-sync-service.js", () => ({
  updateCalendarEvent: updateCalendarEventMock,
}));

vi.mock("../wiki/space-service.js", () => ({
  GENERAL_SPACE_ID: "00000000-0000-0000-0000-000000000001",
}));

const { endMeetingByRoomName, closeMeetingWithSideEffects } = await import("./meeting-service.js");

describe("endMeetingByRoomName", () => {
  const endedAt = new Date("2026-05-26T12:00:00.000Z");

  beforeEach(() => {
    getMeetingByRoomNameMock.mockReset();
    endMeetingIfNotEndedMock.mockReset();
    closeAllParticipantSessionsMock.mockReset();
    closeActiveMeetingAgentSessionsMock.mockReset();
    writeAuditLogMock.mockReset();
    writeAuditLogMock.mockResolvedValue(undefined);
    updateCalendarEventMock.mockReset();
    deleteRoomMock.mockReset();
  });

  it("ends an active meeting via CAS and closes participant + agent sessions", async () => {
    getMeetingByRoomNameMock.mockResolvedValue({ id: "m1", roomName: "room-x", status: "active" });
    endMeetingIfNotEndedMock.mockResolvedValue({ id: "m1", status: "ended", endedAt });

    const result = await endMeetingByRoomName("room-x", endedAt);

    expect(endMeetingIfNotEndedMock).toHaveBeenCalledWith("m1", endedAt);
    expect(closeAllParticipantSessionsMock).toHaveBeenCalledWith("m1", endedAt);
    // PR-Charlie #H2: agent sessions are also closed so the autonomous loop stops.
    expect(closeActiveMeetingAgentSessionsMock).toHaveBeenCalledWith("m1", endedAt);
    expect(result).toEqual({ id: "m1", status: "ended", endedAt });
  });

  it("writes a room_finished audit row when the CAS wins", async () => {
    getMeetingByRoomNameMock.mockResolvedValue({ id: "m1", roomName: "room-x", status: "active" });
    endMeetingIfNotEndedMock.mockResolvedValue({ id: "m1", status: "ended", endedAt });

    await endMeetingByRoomName("room-x", endedAt);

    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "meeting.room_finished",
        resourceType: "meeting",
        resourceId: "m1",
        actorUserId: null,
        metadata: { reason: "room_finished", roomName: "room-x" },
      })
    );
  });

  it("returns null when the room maps to no meeting", async () => {
    getMeetingByRoomNameMock.mockResolvedValue(null);

    const result = await endMeetingByRoomName("coworking", endedAt);

    expect(result).toBeNull();
    expect(endMeetingIfNotEndedMock).not.toHaveBeenCalled();
    expect(closeAllParticipantSessionsMock).not.toHaveBeenCalled();
    expect(closeActiveMeetingAgentSessionsMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("is idempotent: returns null without side effects when the meeting is already ended", async () => {
    getMeetingByRoomNameMock.mockResolvedValue({ id: "m1", roomName: "room-x", status: "ended" });

    const result = await endMeetingByRoomName("room-x", endedAt);

    expect(result).toBeNull();
    expect(endMeetingIfNotEndedMock).not.toHaveBeenCalled();
    expect(closeAllParticipantSessionsMock).not.toHaveBeenCalled();
    expect(closeActiveMeetingAgentSessionsMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("skips audit + calendar when the CAS loses (duplicate webhook delivery)", async () => {
    // Meeting was active when we fetched it, but a concurrent delivery already
    // ran the UPDATE and the CAS query returns no rows.
    getMeetingByRoomNameMock.mockResolvedValue({ id: "m1", roomName: "room-x", status: "active" });
    endMeetingIfNotEndedMock.mockResolvedValue(null);

    const result = await endMeetingByRoomName("room-x", endedAt);

    expect(result).toBeNull();
    expect(endMeetingIfNotEndedMock).toHaveBeenCalledWith("m1", endedAt);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
    expect(deleteRoomMock).not.toHaveBeenCalled();
  });

  it("does not delete the LiveKit room from the webhook path", async () => {
    getMeetingByRoomNameMock.mockResolvedValue({ id: "m1", roomName: "room-x", status: "active" });
    endMeetingIfNotEndedMock.mockResolvedValue({ id: "m1", status: "ended", endedAt });

    await endMeetingByRoomName("room-x", endedAt);

    // LiveKit already tore down the room — calling deleteRoom would 404.
    expect(deleteRoomMock).not.toHaveBeenCalled();
  });
});

describe("closeMeetingWithSideEffects", () => {
  const endedAt = new Date("2026-05-26T12:00:00.000Z");
  const baseMeeting = { id: "m1", roomName: "room-x", status: "active" } as const;

  beforeEach(() => {
    endMeetingIfNotEndedMock.mockReset();
    closeAllParticipantSessionsMock.mockReset();
    closeActiveMeetingAgentSessionsMock.mockReset();
    writeAuditLogMock.mockReset();
    writeAuditLogMock.mockResolvedValue(undefined);
    updateCalendarEventMock.mockReset();
    deleteRoomMock.mockReset();
  });

  it("runs the full end_for_all side effects when CAS wins", async () => {
    endMeetingIfNotEndedMock.mockResolvedValue({ id: "m1", status: "ended", endedAt });

    const result = await closeMeetingWithSideEffects(
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub for tests
      baseMeeting as any,
      {
        reason: "end_for_all",
        endedAt,
        actor: { userId: "user-1", email: "user@example.com" },
        deleteLiveKitRoom: true,
        syncCalendar: true,
      }
    );

    expect(deleteRoomMock).toHaveBeenCalledWith("room-x");
    expect(updateCalendarEventMock).toHaveBeenCalledWith("m1", "user-1");
    // PR-Charlie #H2: agent sessions are also closed by the shared helper.
    expect(closeActiveMeetingAgentSessionsMock).toHaveBeenCalledWith("m1", endedAt);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "meeting.end_for_all",
        actorUserId: "user-1",
        actorEmail: "user@example.com",
      })
    );
    expect(result).toEqual({ id: "m1", status: "ended", endedAt });
  });

  it("swallows calendar / livekit failures and still writes audit", async () => {
    endMeetingIfNotEndedMock.mockResolvedValue({ id: "m1", status: "ended", endedAt });
    deleteRoomMock.mockRejectedValue(new Error("room not found"));
    updateCalendarEventMock.mockRejectedValue(new Error("oauth expired"));

    // biome-ignore lint/suspicious/noExplicitAny: minimal stub for tests
    const result = await closeMeetingWithSideEffects(baseMeeting as any, {
      reason: "end_for_all",
      endedAt,
      actor: { userId: "user-1" },
      deleteLiveKitRoom: true,
      syncCalendar: true,
    });

    expect(result).toEqual({ id: "m1", status: "ended", endedAt });
    expect(writeAuditLogMock).toHaveBeenCalled();
  });
});
