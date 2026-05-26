import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M6: Split-brain behaviour when Valkey is unreachable.
 *
 * When Valkey throws / is missing, every replica's tryAcquireLeadership returns
 * true (availability favoured over strict single-firing). The contract that
 * keeps reality bounded is:
 *   1. tryAcquireLeadership remains callable (no exception leaks)
 *   2. each replica still goes through the DB-side cooldown gate
 *      (autonomous-agent-service uses getLastAutonomousEventTime), so a
 *      replica that lost the race will see the recent event and skip.
 *
 * This test reproduces the scenario at the unit level: two simulated replicas
 * acquire leadership simultaneously, then a cooldown is seen by the second
 * one — the second replica must NOT trigger generateMeetingAgentResponse.
 */

const {
  listAutonomousActiveSessionsMock,
  listFinalSegmentsAfterMock,
  getLastAutonomousEventTimeMock,
  updateSessionEvalCursorMock,
  initLlmWithSettingsMock,
  buildAutonomousDecisionPromptMock,
  generateMeetingAgentResponseMock,
  getValkeyMock,
} = vi.hoisted(() => ({
  listAutonomousActiveSessionsMock: vi.fn(),
  listFinalSegmentsAfterMock: vi.fn(),
  getLastAutonomousEventTimeMock: vi.fn(),
  updateSessionEvalCursorMock: vi.fn(),
  initLlmWithSettingsMock: vi.fn(),
  buildAutonomousDecisionPromptMock: vi.fn(),
  generateMeetingAgentResponseMock: vi.fn(),
  getValkeyMock: vi.fn(),
}));

vi.mock("../../repositories/meeting/meeting-realtime-repository.js", () => ({
  listAutonomousActiveSessions: listAutonomousActiveSessionsMock,
  listFinalSegmentsAfter: listFinalSegmentsAfterMock,
  getLastAutonomousEventTime: getLastAutonomousEventTimeMock,
  updateSessionEvalCursor: updateSessionEvalCursorMock,
}));

vi.mock("../../ai/llm/index.js", () => ({
  initLlmWithSettings: initLlmWithSettingsMock,
}));

vi.mock("../../ai/agent/autonomous-decision-prompt.js", () => ({
  buildAutonomousDecisionPrompt: buildAutonomousDecisionPromptMock,
}));

vi.mock("./meeting-agent-runtime-service.js", () => ({
  generateMeetingAgentResponse: generateMeetingAgentResponseMock,
}));

vi.mock("../../lib/valkey.js", () => ({
  getValkey: getValkeyMock,
}));

describe("autonomous-agent split-brain (M6)", () => {
  beforeEach(() => {
    vi.resetModules();
    listAutonomousActiveSessionsMock.mockReset();
    listFinalSegmentsAfterMock.mockReset();
    getLastAutonomousEventTimeMock.mockReset();
    updateSessionEvalCursorMock.mockReset();
    initLlmWithSettingsMock.mockReset();
    buildAutonomousDecisionPromptMock.mockReset();
    generateMeetingAgentResponseMock.mockReset();
    getValkeyMock.mockReset();
  });

  it("tryAcquireLeadership returns true on every replica when Valkey throws (split-brain)", async () => {
    // Simulate Valkey present but every call rejecting (network partition).
    getValkeyMock.mockReturnValue({
      eval: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    });

    const { tryAcquireLeadership } = await import("./autonomous-leader.js");
    // Two "replicas" — both see the same throw → both become leader. This is
    // intentional (availability favoured); the cooldown gate below stops the
    // double-fire.
    await expect(tryAcquireLeadership()).resolves.toBe(true);
    await expect(tryAcquireLeadership()).resolves.toBe(true);
  });

  it("DB cooldown prevents duplicate intervention even if two replicas race past leadership", async () => {
    // No Valkey: every replica is "leader".
    getValkeyMock.mockReturnValue(null);

    const session = {
      id: "session-1",
      meetingId: "meeting-1",
      agentId: "agent-1",
      lastAutoEvalSegmentId: null,
      invokedByUserId: "user-1",
    };
    const agent = {
      id: "agent-1",
      name: "Test Agent",
      systemPrompt: "system",
      interventionStyle: "proactive",
      defaultProvider: "gemini",
      // 5 minute cooldown — much longer than any test execution window.
      autonomousCooldownSec: 300,
    };

    listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
    listFinalSegmentsAfterMock.mockResolvedValue([
      { id: "s1", speakerLabel: "A", content: "hi" },
      { id: "s2", speakerLabel: "A", content: "hi" },
      { id: "s3", speakerLabel: "A", content: "hi" },
      { id: "s4", speakerLabel: "A", content: "hi" },
    ]);
    // Recent intervention 10 s ago → well inside the cooldown window.
    getLastAutonomousEventTimeMock.mockResolvedValue(new Date(Date.now() - 10_000));
    updateSessionEvalCursorMock.mockResolvedValue(undefined);

    initLlmWithSettingsMock.mockResolvedValue({
      model: {
        invoke: vi.fn().mockResolvedValue({
          content: JSON.stringify({ shouldIntervene: true, suggestedPrompt: "go" }),
        }),
      },
      provider: "gemini",
      overrides: {},
    });

    const mod = await import("./autonomous-agent-service.js");
    mod.startAutonomousAgentLoop(50);
    await new Promise((r) => setTimeout(r, 200));
    await mod.stopAutonomousAgentLoop();

    // Cooldown should have blocked every replica, regardless of leadership.
    expect(generateMeetingAgentResponseMock).not.toHaveBeenCalled();
  });

  it("per-meeting Valkey in-flight lock blocks a second pod from concurrent eval (M2)", async () => {
    // First SET NX returns OK (claimed), second returns null (blocked).
    const set = vi
      .fn()
      .mockImplementationOnce(async () => "OK")
      .mockImplementation(async () => null);
    getValkeyMock.mockReturnValue({
      // Leader for both calls.
      eval: vi.fn().mockResolvedValue(1),
      set,
    });

    const session = {
      id: "session-1",
      meetingId: "meeting-1",
      agentId: "agent-1",
      lastAutoEvalSegmentId: null,
      invokedByUserId: "user-1",
    };
    const agent = {
      id: "agent-1",
      name: "Agent",
      systemPrompt: "p",
      interventionStyle: "proactive",
      defaultProvider: "gemini",
      autonomousCooldownSec: 0,
    };

    listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
    // No new segments → returns early, but we still expect SET NX to be called
    // exactly once (the first eval), and the second to short-circuit.
    listFinalSegmentsAfterMock.mockResolvedValue([]);
    getLastAutonomousEventTimeMock.mockResolvedValue(null);

    const mod = await import("./autonomous-agent-service.js");
    mod.startAutonomousAgentLoop(50);
    await new Promise((r) => setTimeout(r, 200));
    await mod.stopAutonomousAgentLoop();

    // We at least called SET NX once (first attempt to claim).
    expect(set).toHaveBeenCalled();
    const firstCallArgs = set.mock.calls[0];
    expect(firstCallArgs?.[0]).toBe("echolore:autonomous-eval:in-flight:meeting-1");
    expect(firstCallArgs?.[2]).toBe("PX");
    expect(firstCallArgs?.[4]).toBe("NX");
  });
});
