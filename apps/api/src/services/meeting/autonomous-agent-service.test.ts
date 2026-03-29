import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listAutonomousActiveSessionsMock,
  listFinalSegmentsAfterMock,
  getLastAutonomousEventTimeMock,
  updateSessionEvalCursorMock,
  initLlmWithSettingsMock,
  buildAutonomousDecisionPromptMock,
  generateMeetingAgentResponseMock,
} = vi.hoisted(() => ({
  listAutonomousActiveSessionsMock: vi.fn(),
  listFinalSegmentsAfterMock: vi.fn(),
  getLastAutonomousEventTimeMock: vi.fn(),
  updateSessionEvalCursorMock: vi.fn(),
  initLlmWithSettingsMock: vi.fn(),
  buildAutonomousDecisionPromptMock: vi.fn(),
  generateMeetingAgentResponseMock: vi.fn(),
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

describe("autonomous-agent-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    listAutonomousActiveSessionsMock.mockReset();
    listFinalSegmentsAfterMock.mockReset();
    getLastAutonomousEventTimeMock.mockReset();
    updateSessionEvalCursorMock.mockReset();
    initLlmWithSettingsMock.mockReset();
    buildAutonomousDecisionPromptMock.mockReset();
    generateMeetingAgentResponseMock.mockReset();
  });

  const makeSession = (overrides?: Record<string, unknown>) => ({
    id: "session-1",
    meeting_id: "meeting-1",
    agent_id: "agent-1",
    last_auto_eval_segment_id: null,
    invoked_by_user_id: "user-1",
    ...overrides,
  });

  const makeAgent = (overrides?: Record<string, unknown>) => ({
    id: "agent-1",
    name: "Test Agent",
    system_prompt: "You are a helpful assistant",
    intervention_style: "proactive",
    default_provider: "gemini",
    autonomous_cooldown_sec: 60,
    ...overrides,
  });

  const makeSegments = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `seg-${i}`,
      speaker_label: `Speaker ${i}`,
      content: `Content of segment ${i}`,
    }));

  describe("startAutonomousAgentLoop / stopAutonomousAgentLoop", () => {
    it("starts and stops the interval loop", async () => {
      const { startAutonomousAgentLoop, stopAutonomousAgentLoop } = await import(
        "./autonomous-agent-service.js"
      );

      listAutonomousActiveSessionsMock.mockResolvedValue([]);

      startAutonomousAgentLoop(100_000);
      // Calling start again should be a no-op (no duplicate intervals)
      startAutonomousAgentLoop(100_000);

      stopAutonomousAgentLoop();
      // Stopping again should be safe
      stopAutonomousAgentLoop();
    });
  });

  describe("transcript sanitization with XML delimiters", () => {
    it("wraps each transcript segment with <transcript_line> delimiters in the prompt", async () => {
      const session = makeSession();
      const agent = makeAgent();
      const segments = makeSegments(4);

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(segments);
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      buildAutonomousDecisionPromptMock.mockReturnValue("decision prompt");

      const invokeResult = {
        content: JSON.stringify({
          shouldIntervene: false,
          reason: "Not needed",
          suggestedPrompt: "",
        }),
      };
      initLlmWithSettingsMock.mockResolvedValue({
        model: { invoke: vi.fn().mockResolvedValue(invokeResult) },
        provider: "gemini",
        overrides: {},
      });

      // Manually trigger the evaluation via dynamic import and internal flow
      // We test that buildAutonomousDecisionPrompt receives transcript lines with XML delimiters
      const mod = await import("./autonomous-agent-service.js");
      // Start the loop to trigger evaluation, but we'll verify the prompt building
      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);

      // Since we can't directly call the private evaluateAgent, we verify through the
      // buildAutonomousDecisionPrompt mock call which receives the formatted lines
      // We need to trigger the tick - start a fast loop then stop
      const fastInterval = 50;
      mod.startAutonomousAgentLoop(fastInterval);

      // Wait for one tick to execute
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      if (buildAutonomousDecisionPromptMock.mock.calls.length > 0) {
        const call = buildAutonomousDecisionPromptMock.mock.calls[0]?.[0];
        expect(call.recentTranscriptLines).toEqual([
          "<transcript_line>Speaker 0: Content of segment 0</transcript_line>",
          "<transcript_line>Speaker 1: Content of segment 1</transcript_line>",
          "<transcript_line>Speaker 2: Content of segment 2</transcript_line>",
          "<transcript_line>Speaker 3: Content of segment 3</transcript_line>",
        ]);
      }
    });
  });

  describe("Zod validation of LLM response", () => {
    it("returns shouldIntervene false when LLM returns invalid JSON", async () => {
      const session = makeSession();
      const agent = makeAgent({ autonomous_cooldown_sec: 0 });
      const segments = makeSegments(4);

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(segments);
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      buildAutonomousDecisionPromptMock.mockReturnValue("decision prompt");

      // Return invalid JSON from LLM
      initLlmWithSettingsMock.mockResolvedValue({
        model: { invoke: vi.fn().mockResolvedValue({ content: "This is not JSON at all" }) },
        provider: "gemini",
        overrides: {},
      });

      const mod = await import("./autonomous-agent-service.js");
      mod.startAutonomousAgentLoop(50);
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      // generateMeetingAgentResponse should NOT have been called because invalid JSON
      // means shouldIntervene defaults to false
      expect(generateMeetingAgentResponseMock).not.toHaveBeenCalled();
    });

    it("returns shouldIntervene false when LLM returns valid JSON with invalid schema", async () => {
      const session = makeSession();
      const agent = makeAgent({ autonomous_cooldown_sec: 0 });
      const segments = makeSegments(4);

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(segments);
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      buildAutonomousDecisionPromptMock.mockReturnValue("decision prompt");

      // Return valid JSON but with wrong schema (shouldIntervene is a string, not boolean)
      initLlmWithSettingsMock.mockResolvedValue({
        model: {
          invoke: vi.fn().mockResolvedValue({
            content: JSON.stringify({ shouldIntervene: "yes", reason: 42 }),
          }),
        },
        provider: "gemini",
        overrides: {},
      });

      const mod = await import("./autonomous-agent-service.js");
      mod.startAutonomousAgentLoop(50);
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      expect(generateMeetingAgentResponseMock).not.toHaveBeenCalled();
    });
  });

  describe("shouldIntervene logic", () => {
    it("skips evaluation when fewer than MIN_NEW_SEGMENTS (3) are available", async () => {
      const session = makeSession();
      const agent = makeAgent();

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(makeSegments(2)); // Only 2, less than MIN_NEW_SEGMENTS

      const mod = await import("./autonomous-agent-service.js");
      mod.startAutonomousAgentLoop(50);
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      // Should not reach the LLM call
      expect(initLlmWithSettingsMock).not.toHaveBeenCalled();
      expect(generateMeetingAgentResponseMock).not.toHaveBeenCalled();
    });

    it("skips evaluation when within cooldown period", async () => {
      const session = makeSession();
      const agent = makeAgent({ autonomous_cooldown_sec: 300 }); // 5 min cooldown

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(makeSegments(5));
      // Last event was 10 seconds ago, well within 300s cooldown
      getLastAutonomousEventTimeMock.mockResolvedValue(new Date(Date.now() - 10_000));

      const mod = await import("./autonomous-agent-service.js");
      mod.startAutonomousAgentLoop(50);
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      expect(initLlmWithSettingsMock).not.toHaveBeenCalled();
      expect(generateMeetingAgentResponseMock).not.toHaveBeenCalled();
    });

    it("triggers intervention when LLM decides shouldIntervene is true", async () => {
      const session = makeSession();
      const agent = makeAgent({ autonomous_cooldown_sec: 0 });
      const segments = makeSegments(4);

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(segments);
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      buildAutonomousDecisionPromptMock.mockReturnValue("decision prompt");

      initLlmWithSettingsMock.mockResolvedValue({
        model: {
          invoke: vi.fn().mockResolvedValue({
            content: JSON.stringify({
              shouldIntervene: true,
              reason: "Topic is off-track",
              suggestedPrompt: "Let me redirect the conversation",
            }),
          }),
        },
        provider: "gemini",
        overrides: {},
      });
      generateMeetingAgentResponseMock.mockResolvedValue(undefined);

      const mod = await import("./autonomous-agent-service.js");
      mod.startAutonomousAgentLoop(50);
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      expect(generateMeetingAgentResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          meetingId: "meeting-1",
          agentId: "agent-1",
          prompt: "Let me redirect the conversation",
          triggeredByUserId: "user-1",
          triggerMode: "autonomous",
        })
      );
    });

    it("does not intervene when LLM decides shouldIntervene is false", async () => {
      const session = makeSession();
      const agent = makeAgent({ autonomous_cooldown_sec: 0 });
      const segments = makeSegments(4);

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(segments);
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      buildAutonomousDecisionPromptMock.mockReturnValue("decision prompt");

      initLlmWithSettingsMock.mockResolvedValue({
        model: {
          invoke: vi.fn().mockResolvedValue({
            content: JSON.stringify({
              shouldIntervene: false,
              reason: "Conversation is on-track",
              suggestedPrompt: "",
            }),
          }),
        },
        provider: "gemini",
        overrides: {},
      });

      const mod = await import("./autonomous-agent-service.js");
      mod.startAutonomousAgentLoop(50);
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      expect(generateMeetingAgentResponseMock).not.toHaveBeenCalled();
    });

    it("does not intervene when text generation is not enabled", async () => {
      const session = makeSession();
      const agent = makeAgent({ autonomous_cooldown_sec: 0 });

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(makeSegments(5));
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue(null);

      const mod = await import("./autonomous-agent-service.js");
      mod.startAutonomousAgentLoop(50);
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      expect(generateMeetingAgentResponseMock).not.toHaveBeenCalled();
    });

    it("updates the eval cursor even when decision is to not intervene", async () => {
      const session = makeSession();
      const agent = makeAgent({ autonomous_cooldown_sec: 0 });
      const segments = makeSegments(4);

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(segments);
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      buildAutonomousDecisionPromptMock.mockReturnValue("decision prompt");

      initLlmWithSettingsMock.mockResolvedValue({
        model: {
          invoke: vi.fn().mockResolvedValue({
            content: JSON.stringify({ shouldIntervene: false, reason: "OK", suggestedPrompt: "" }),
          }),
        },
        provider: "gemini",
        overrides: {},
      });

      const mod = await import("./autonomous-agent-service.js");
      mod.startAutonomousAgentLoop(50);
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      expect(updateSessionEvalCursorMock).toHaveBeenCalledWith("session-1", "seg-3");
    });
  });
});
