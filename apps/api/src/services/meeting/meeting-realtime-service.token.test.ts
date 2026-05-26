import { TrackSource } from "@livekit/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M3: the agent bot token must only grant MICROPHONE publish capability so a
 * leaked / coerced token can't push camera or screen-share tracks under the
 * agent identity.
 */

const { getAgentByIdMock, getActiveMeetingAgentSessionMock, addGrantMock, toJwtMock } = vi.hoisted(
  () => ({
    getAgentByIdMock: vi.fn(),
    getActiveMeetingAgentSessionMock: vi.fn(),
    addGrantMock: vi.fn(),
    toJwtMock: vi.fn().mockResolvedValue("jwt-token-stub"),
  })
);

vi.mock("../../repositories/meeting/meeting-realtime-repository.js", async () => {
  // We only need getAgentById + getActiveMeetingAgentSession for
  // issueAgentLiveKitToken; stub the rest.
  return {
    getAgentById: getAgentByIdMock,
    createAgent: vi.fn(),
    createMeetingAgentEvent: vi.fn(),
    createMeetingAgentSession: vi.fn(),
    createTranscriptSegment: vi.fn(),
    getActiveMeetingAgentSession: getActiveMeetingAgentSessionMock,
    getTranscriptSegmentByKey: vi.fn(),
    listActiveAgents: vi.fn(),
    listActiveMeetingAgentSessions: vi.fn(),
    listMeetingAgentEvents: vi.fn(),
    listTranscriptSegmentsByMeeting: vi.fn(),
    updateAgent: vi.fn(),
    updateMeetingAgentSession: vi.fn(),
    updateTranscriptSegment: vi.fn(),
  };
});

vi.mock("livekit-server-sdk", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    AccessToken: class MockAccessToken {
      addGrant = addGrantMock;
      toJwt = toJwtMock;
    },
  };
});

vi.mock("../../lib/livekit-config.js", () => ({
  livekitApiKey: "test-key",
  livekitApiSecret: "test-secret",
}));

describe("issueAgentLiveKitToken (M3 publish-source restriction + #70 G1)", () => {
  beforeEach(() => {
    getAgentByIdMock.mockReset();
    getActiveMeetingAgentSessionMock.mockReset();
    addGrantMock.mockReset();
    toJwtMock.mockClear();
    // Default: an active session exists so the happy path is unblocked.
    getActiveMeetingAgentSessionMock.mockResolvedValue({ id: "session-1", state: "active" });
  });

  it("restricts the agent token to MICROPHONE publish-source and drops canSubscribe", async () => {
    getAgentByIdMock.mockResolvedValue({
      id: "agent-1",
      name: "Agent",
      isActive: true,
    });

    const { issueAgentLiveKitToken } = await import("./meeting-realtime-service.js");
    const result = await issueAgentLiveKitToken({
      meetingId: "meeting-1",
      agentId: "agent-1",
      roomName: "room-x",
    });

    expect(result).not.toBeNull();
    expect(addGrantMock).toHaveBeenCalledTimes(1);
    const grant = addGrantMock.mock.calls[0]?.[0];
    expect(grant).toMatchObject({
      roomJoin: true,
      room: "room-x",
      canPublish: true,
      // #70 G1: the speak-only bot does not need subscribe rights.
      canSubscribe: false,
      canPublishData: true,
    });
    expect(grant.canPublishSources).toEqual([TrackSource.MICROPHONE]);
  });

  it("returns null when the agent is inactive (unchanged behaviour)", async () => {
    getAgentByIdMock.mockResolvedValue({ id: "agent-1", name: "Agent", isActive: false });

    const { issueAgentLiveKitToken } = await import("./meeting-realtime-service.js");
    const result = await issueAgentLiveKitToken({
      meetingId: "meeting-1",
      agentId: "agent-1",
      roomName: "room-x",
    });

    expect(result).toBeNull();
    expect(addGrantMock).not.toHaveBeenCalled();
  });

  it("returns null when no active agent session exists for the meeting (#70 G1)", async () => {
    getAgentByIdMock.mockResolvedValue({ id: "agent-1", name: "Agent", isActive: true });
    getActiveMeetingAgentSessionMock.mockResolvedValue(null);

    const { issueAgentLiveKitToken } = await import("./meeting-realtime-service.js");
    const result = await issueAgentLiveKitToken({
      meetingId: "meeting-1",
      agentId: "agent-1",
      roomName: "room-x",
    });

    expect(result).toBeNull();
    expect(getActiveMeetingAgentSessionMock).toHaveBeenCalledWith("meeting-1", "agent-1");
    expect(addGrantMock).not.toHaveBeenCalled();
  });
});
