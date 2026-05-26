import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getMeetingByRoomNameMock,
  updateMeetingMock,
  closeAllParticipantSessionsMock,
  closeActiveMeetingAgentSessionsMock,
} = vi.hoisted(() => ({
  getMeetingByRoomNameMock: vi.fn(),
  updateMeetingMock: vi.fn(),
  closeAllParticipantSessionsMock: vi.fn(),
  closeActiveMeetingAgentSessionsMock: vi.fn(),
}));

vi.mock("../../repositories/meeting/meeting-repository.js", () => ({
  getMeetingByRoomName: getMeetingByRoomNameMock,
  updateMeeting: updateMeetingMock,
  closeAllParticipantSessions: closeAllParticipantSessionsMock,
  // Unused by endMeetingByRoomName but imported/re-exported by meeting-service.
  createMeetingSummaryArtifactsTx: vi.fn(),
  ensureMeetingNotesPage: vi.fn(),
  getLatestMeetingSummary: vi.fn(),
  getRoomAiWikiPageByMeetingId: vi.fn(),
}));

vi.mock("../../repositories/meeting/meeting-realtime-repository.js", () => ({
  closeActiveMeetingAgentSessions: closeActiveMeetingAgentSessionsMock,
}));

vi.mock("../wiki/space-service.js", () => ({
  GENERAL_SPACE_ID: "00000000-0000-0000-0000-000000000001",
}));

const { endMeetingByRoomName } = await import("./meeting-service.js");

describe("endMeetingByRoomName", () => {
  const endedAt = new Date("2026-05-26T12:00:00.000Z");

  beforeEach(() => {
    getMeetingByRoomNameMock.mockReset();
    updateMeetingMock.mockReset();
    closeAllParticipantSessionsMock.mockReset();
    closeActiveMeetingAgentSessionsMock.mockReset();
  });

  it("ends an active meeting and closes participant + agent sessions", async () => {
    getMeetingByRoomNameMock.mockResolvedValue({ id: "m1", roomName: "room-x", status: "active" });
    updateMeetingMock.mockResolvedValue({ id: "m1", status: "ended", endedAt });

    const result = await endMeetingByRoomName("room-x", endedAt);

    expect(updateMeetingMock).toHaveBeenCalledWith("m1", { status: "ended", endedAt });
    expect(closeAllParticipantSessionsMock).toHaveBeenCalledWith("m1", endedAt);
    // H2: agent sessions are also closed so the autonomous loop stops.
    expect(closeActiveMeetingAgentSessionsMock).toHaveBeenCalledWith("m1", endedAt);
    expect(result).toEqual({ id: "m1", status: "ended", endedAt });
  });

  it("returns null when the room maps to no meeting", async () => {
    getMeetingByRoomNameMock.mockResolvedValue(null);

    const result = await endMeetingByRoomName("coworking", endedAt);

    expect(result).toBeNull();
    expect(updateMeetingMock).not.toHaveBeenCalled();
    expect(closeAllParticipantSessionsMock).not.toHaveBeenCalled();
    expect(closeActiveMeetingAgentSessionsMock).not.toHaveBeenCalled();
  });

  it("is idempotent: returns null when the meeting is already ended", async () => {
    getMeetingByRoomNameMock.mockResolvedValue({ id: "m1", roomName: "room-x", status: "ended" });

    const result = await endMeetingByRoomName("room-x", endedAt);

    expect(result).toBeNull();
    expect(updateMeetingMock).not.toHaveBeenCalled();
    expect(closeAllParticipantSessionsMock).not.toHaveBeenCalled();
    expect(closeActiveMeetingAgentSessionsMock).not.toHaveBeenCalled();
  });
});
