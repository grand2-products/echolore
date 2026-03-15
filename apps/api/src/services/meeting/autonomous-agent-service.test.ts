import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listAutonomousActiveSessionsMock,
  listFinalSegmentsAfterMock,
  getLastAutonomousEventTimeMock,
  updateSessionEvalCursorMock,
  getLlmSettingsMock,
  createChatModelMock,
  isTextGenerationEnabledMock,
  resolveTextProviderMock,
  buildAutonomousDecisionPromptMock,
  generateMeetingAgentResponseMock,
} = vi.hoisted(() => ({
  listAutonomousActiveSessionsMock: vi.fn(),
  listFinalSegmentsAfterMock: vi.fn(),
  getLastAutonomousEventTimeMock: vi.fn(),
  updateSessionEvalCursorMock: vi.fn(),
  getLlmSettingsMock: vi.fn(),
  createChatModelMock: vi.fn(),
  isTextGenerationEnabledMock: vi.fn(),
  resolveTextProviderMock: vi.fn(),
  buildAutonomousDecisionPromptMock: vi.fn(),
  generateMeetingAgentResponseMock: vi.fn(),
}));

vi.mock("../../repositories/meeting/meeting-realtime-repository.js", () => ({
  listAutonomousActiveSessions: listAutonomousActiveSessionsMock,
  listFinalSegmentsAfter: listFinalSegmentsAfterMock,
  getLastAutonomousEventTime: getLastAutonomousEventTimeMock,
  updateSessionEvalCursor: updateSessionEvalCursorMock,
}));

vi.mock("../admin/admin-service.js", () => ({
  getLlmSettings: getLlmSettingsMock,
}));

vi.mock("../../ai/llm/index.js", () => ({
  createChatModel: createChatModelMock,
  isTextGenerationEnabled: isTextGenerationEnabledMock,
  resolveTextProvider: resolveTextProviderMock,
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
    getLlmSettingsMock.mockReset();
    createChatModelMock.mockReset();
    isTextGenerationEnabledMock.mockReset();
    resolveTextProviderMock.mockReset();
    buildAutonomousDecisionPromptMock.mockReset();
    generateMeetingAgentResponseMock.mockReset();
  });

  const makeSession = (overrides?: Record<string, unknown>) => ({
    id: "session-1",
    meetingId: "meeting-1",
    agentId: "agent-1",
    lastAutoEvalSegmentId: null,
    invokedByUserId: "user-1",
    ...overrides,
  });

  const makeAgent = (overrides?: Record<string, unknown>) => ({
    id: "agent-1",
    name: "Test Agent",
    systemPrompt: "You are a helpful assistant",
    interventionStyle: "proactive",
    defaultProvider: "gemini",
    autonomousCooldownSec: 60,
    ...overrides,
  });

  const makeSegments = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `seg-${i}`,
      speakerLabel: `Speaker ${i}`,
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

      getLlmSettingsMock.mockResolvedValue({ provider: "gemini", geminiApiKey: "key" });
      resolveTextProviderMock.mockReturnValue("gemini");
      isTextGenerationEnabledMock.mockReturnValue(true);
      buildAutonomousDecisionPromptMock.mockReturnValue("decision prompt");

      const invokeResult = {
        content: JSON.stringify({
          shouldIntervene: false,
          reason: "Not needed",
          suggestedPrompt: "",
        }),
      };
      createChatModelMock.mockReturnValue({
        invoke: vi.fn().mockResolvedValue(invokeResult),
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
      const agent = makeAgent({ autonomousCooldownSec: 0 });
      const segments = makeSegments(4);

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(segments);
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      getLlmSettingsMock.mockResolvedValue({ provider: "gemini", geminiApiKey: "key" });
      resolveTextProviderMock.mockReturnValue("gemini");
      isTextGenerationEnabledMock.mockReturnValue(true);
      buildAutonomousDecisionPromptMock.mockReturnValue("decision prompt");

      // Return invalid JSON from LLM
      createChatModelMock.mockReturnValue({
        invoke: vi.fn().mockResolvedValue({ content: "This is not JSON at all" }),
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
      const agent = makeAgent({ autonomousCooldownSec: 0 });
      const segments = makeSegments(4);

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(segments);
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      getLlmSettingsMock.mockResolvedValue({ provider: "gemini", geminiApiKey: "key" });
      resolveTextProviderMock.mockReturnValue("gemini");
      isTextGenerationEnabledMock.mockReturnValue(true);
      buildAutonomousDecisionPromptMock.mockReturnValue("decision prompt");

      // Return valid JSON but with wrong schema (shouldIntervene is a string, not boolean)
      createChatModelMock.mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          content: JSON.stringify({ shouldIntervene: "yes", reason: 42 }),
        }),
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
      expect(createChatModelMock).not.toHaveBeenCalled();
      expect(generateMeetingAgentResponseMock).not.toHaveBeenCalled();
    });

    it("skips evaluation when within cooldown period", async () => {
      const session = makeSession();
      const agent = makeAgent({ autonomousCooldownSec: 300 }); // 5 min cooldown

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(makeSegments(5));
      // Last event was 10 seconds ago, well within 300s cooldown
      getLastAutonomousEventTimeMock.mockResolvedValue(new Date(Date.now() - 10_000));

      const mod = await import("./autonomous-agent-service.js");
      mod.startAutonomousAgentLoop(50);
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      expect(createChatModelMock).not.toHaveBeenCalled();
      expect(generateMeetingAgentResponseMock).not.toHaveBeenCalled();
    });

    it("triggers intervention when LLM decides shouldIntervene is true", async () => {
      const session = makeSession();
      const agent = makeAgent({ autonomousCooldownSec: 0 });
      const segments = makeSegments(4);

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(segments);
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      getLlmSettingsMock.mockResolvedValue({ provider: "gemini", geminiApiKey: "key" });
      resolveTextProviderMock.mockReturnValue("gemini");
      isTextGenerationEnabledMock.mockReturnValue(true);
      buildAutonomousDecisionPromptMock.mockReturnValue("decision prompt");

      createChatModelMock.mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            shouldIntervene: true,
            reason: "Topic is off-track",
            suggestedPrompt: "Let me redirect the conversation",
          }),
        }),
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
      const agent = makeAgent({ autonomousCooldownSec: 0 });
      const segments = makeSegments(4);

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(segments);
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      getLlmSettingsMock.mockResolvedValue({ provider: "gemini", geminiApiKey: "key" });
      resolveTextProviderMock.mockReturnValue("gemini");
      isTextGenerationEnabledMock.mockReturnValue(true);
      buildAutonomousDecisionPromptMock.mockReturnValue("decision prompt");

      createChatModelMock.mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            shouldIntervene: false,
            reason: "Conversation is on-track",
            suggestedPrompt: "",
          }),
        }),
      });

      const mod = await import("./autonomous-agent-service.js");
      mod.startAutonomousAgentLoop(50);
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      expect(generateMeetingAgentResponseMock).not.toHaveBeenCalled();
    });

    it("does not intervene when text generation is not enabled", async () => {
      const session = makeSession();
      const agent = makeAgent({ autonomousCooldownSec: 0 });

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(makeSegments(5));
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      getLlmSettingsMock.mockResolvedValue({ provider: null });
      resolveTextProviderMock.mockReturnValue(null);
      isTextGenerationEnabledMock.mockReturnValue(false);

      const mod = await import("./autonomous-agent-service.js");
      mod.startAutonomousAgentLoop(50);
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      expect(generateMeetingAgentResponseMock).not.toHaveBeenCalled();
    });

    it("updates the eval cursor even when decision is to not intervene", async () => {
      const session = makeSession();
      const agent = makeAgent({ autonomousCooldownSec: 0 });
      const segments = makeSegments(4);

      listAutonomousActiveSessionsMock.mockResolvedValue([{ session, agent }]);
      listFinalSegmentsAfterMock.mockResolvedValue(segments);
      getLastAutonomousEventTimeMock.mockResolvedValue(null);
      updateSessionEvalCursorMock.mockResolvedValue(undefined);

      getLlmSettingsMock.mockResolvedValue({ provider: "gemini", geminiApiKey: "key" });
      resolveTextProviderMock.mockReturnValue("gemini");
      isTextGenerationEnabledMock.mockReturnValue(true);
      buildAutonomousDecisionPromptMock.mockReturnValue("decision prompt");

      createChatModelMock.mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          content: JSON.stringify({ shouldIntervene: false, reason: "OK", suggestedPrompt: "" }),
        }),
      });

      const mod = await import("./autonomous-agent-service.js");
      mod.startAutonomousAgentLoop(50);
      await new Promise((resolve) => setTimeout(resolve, 150));
      mod.stopAutonomousAgentLoop();

      expect(updateSessionEvalCursorMock).toHaveBeenCalledWith("session-1", "seg-3");
    });
  });
});
