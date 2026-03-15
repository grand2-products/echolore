import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  aituberServiceMock,
  ttsServiceMock,
  livekitServiceMock,
  initLlmWithSettingsMock,
  chatModelMock,
} = vi.hoisted(() => ({
  aituberServiceMock: {
    getUnprocessedMessages: vi.fn(),
    markMessageProcessed: vi.fn(),
    saveAssistantMessage: vi.fn(),
    getMessageHistory: vi.fn(),
  },
  ttsServiceMock: {
    splitIntoSentences: vi.fn(),
    synthesizeSpeech: vi.fn(),
  },
  livekitServiceMock: {
    sendDataToRoom: vi.fn(),
  },
  initLlmWithSettingsMock: vi.fn(),
  chatModelMock: {
    stream: vi.fn(),
  },
}));

vi.mock("./aituber-service.js", () => aituberServiceMock);

vi.mock("./aituber-tts-service.js", () => ttsServiceMock);

vi.mock("./aituber-livekit-service.js", () => livekitServiceMock);

vi.mock("../../ai/llm/index.js", () => ({
  initLlmWithSettings: initLlmWithSettingsMock,
}));

vi.mock("@langchain/core/messages", () => ({
  SystemMessage: class SystemMessage {
    content: string;
    constructor(content: string) {
      this.content = content;
    }
  },
  HumanMessage: class HumanMessage {
    content: string;
    constructor(content: string) {
      this.content = content;
    }
  },
  AIMessage: class AIMessage {
    content: string;
    constructor(content: string) {
      this.content = content;
    }
  },
}));

import { startProcessingLoop, stopProcessingLoop } from "./aituber-ai-service.js";

const makeCharacter = (overrides = {}) => ({
  id: "char-1",
  name: "TestChar",
  personality: "Friendly",
  systemPrompt: "You are a helpful character.",
  speakingStyle: "polite",
  languageCode: "ja-JP",
  voiceName: "voice-1",
  avatarUrl: null,
  isPublic: false,
  createdBy: "user-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  ...overrides,
});

const makeViewerMessage = (overrides = {}) => ({
  id: "msg-1",
  sessionId: "session-1",
  role: "viewer" as const,
  senderUserId: "user-1",
  senderName: "Taro",
  content: "Hello!",
  processedAt: null,
  createdAt: new Date("2026-01-01"),
  ...overrides,
});

describe("aituber-ai-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    aituberServiceMock.getUnprocessedMessages.mockReset();
    aituberServiceMock.markMessageProcessed.mockReset();
    aituberServiceMock.saveAssistantMessage.mockReset();
    aituberServiceMock.getMessageHistory.mockReset();
    ttsServiceMock.splitIntoSentences.mockReset();
    ttsServiceMock.synthesizeSpeech.mockReset();
    livekitServiceMock.sendDataToRoom.mockReset();
    initLlmWithSettingsMock.mockReset();
    chatModelMock.stream.mockReset();
  });

  describe("buildSystemPrompt (via generateStreamingResponse)", () => {
    it("includes character name, personality, and speaking style in the prompt", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage();

      // First call returns a message, second returns empty to stop the loop
      aituberServiceMock.getUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.getMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({
        model: chatModelMock,
        provider: "gemini",
        overrides: {},
      });

      // Create an async iterable for the stream
      const streamChunks = [{ content: "Hello " }, { content: "there!" }];
      chatModelMock.stream.mockResolvedValue(
        (async function* () {
          for (const chunk of streamChunks) yield chunk;
        })()
      );

      ttsServiceMock.splitIntoSentences.mockReturnValue(["Hello there!"]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("audio"),
        mimeType: "audio/mp3",
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      // Start the loop and stop it immediately after one iteration
      await startProcessingLoop("session-1", character as never, "room-1");

      // Give the async loop time to process one message
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-1");

      // Verify the stream was called with messages containing SystemMessage
      expect(chatModelMock.stream).toHaveBeenCalledTimes(1);
      const messages = chatModelMock.stream.mock.calls[0]?.[0] as Array<{ content: string }>;
      expect(messages).toBeDefined();
      expect(messages.length).toBeGreaterThanOrEqual(2);

      // First message should be the system prompt containing character info
      const systemMsg = messages[0];
      expect(systemMsg?.content).toContain("TestChar");
      expect(systemMsg?.content).toContain("Friendly");
      expect(systemMsg?.content).toContain("polite");
    });
  });

  describe("message history formatting", () => {
    it("formats assistant messages as AIMessage and viewer messages as HumanMessage with sender name", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage();

      const historyMessages = [
        {
          id: "h1",
          sessionId: "session-1",
          role: "viewer",
          senderUserId: "user-2",
          senderName: "Hanako",
          content: "Previous question",
          processedAt: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "h2",
          sessionId: "session-1",
          role: "assistant",
          senderUserId: null,
          senderName: "TestChar",
          content: "Previous answer",
          processedAt: new Date("2026-01-01T00:01:00Z"),
          createdAt: new Date("2026-01-01T00:01:00Z"),
        },
      ];

      aituberServiceMock.getUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.getMessageHistory.mockResolvedValue(historyMessages);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({
        model: chatModelMock,
        provider: "gemini",
        overrides: {},
      });

      chatModelMock.stream.mockResolvedValue(
        (async function* () {
          yield { content: "Response" };
        })()
      );

      ttsServiceMock.splitIntoSentences.mockReturnValue(["Response"]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("audio"),
        mimeType: "audio/mp3",
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-2", character as never, "room-2");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-2");

      expect(chatModelMock.stream).toHaveBeenCalledTimes(1);
      const messages = chatModelMock.stream.mock.calls[0]?.[0] as Array<{ content: string }>;

      // [SystemMessage, HumanMessage(history), AIMessage(history), HumanMessage(current)]
      expect(messages).toHaveLength(4);
      expect(messages[1]?.content).toBe("[Hanako] Previous question");
      expect(messages[2]?.content).toBe("Previous answer");
      expect(messages[3]?.content).toBe("[Taro] Hello!");
    });
  });

  describe("error handling", () => {
    it("sends idle avatar state when LLM stream fails", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage();

      aituberServiceMock.getUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.getMessageHistory.mockResolvedValue([]);

      initLlmWithSettingsMock.mockResolvedValue({
        model: chatModelMock,
        provider: "gemini",
        overrides: {},
      });

      chatModelMock.stream.mockRejectedValue(new Error("LLM provider error"));
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-3", character as never, "room-3");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-3");

      // Should have sent thinking state, then idle state on error
      const sendCalls = livekitServiceMock.sendDataToRoom.mock.calls as [
        string,
        Record<string, unknown>,
      ][];
      const avatarStates = sendCalls
        .filter(([, data]) => data.type === "avatar-state")
        .map(([, data]) => data.state);

      expect(avatarStates).toContain("thinking");
      expect(avatarStates[avatarStates.length - 1]).toBe("idle");
    });

    it("continues processing after TTS failure", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage();

      aituberServiceMock.getUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.getMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({
        model: chatModelMock,
        provider: "gemini",
        overrides: {},
      });

      chatModelMock.stream.mockResolvedValue(
        (async function* () {
          yield { content: "OK" };
        })()
      );

      ttsServiceMock.splitIntoSentences.mockReturnValue(["OK"]);
      ttsServiceMock.synthesizeSpeech.mockRejectedValue(new Error("TTS error"));
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-4", character as never, "room-4");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-4");

      // Despite TTS failure, the assistant message should still be saved
      expect(aituberServiceMock.saveAssistantMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-4",
          content: "OK",
          characterName: "TestChar",
        })
      );

      // Should end with idle state
      const sendCalls = livekitServiceMock.sendDataToRoom.mock.calls as [
        string,
        Record<string, unknown>,
      ][];
      const lastAvatarState = sendCalls.filter(([, data]) => data.type === "avatar-state").pop();
      expect(lastAvatarState?.[1]).toEqual({ type: "avatar-state", state: "idle" });
    });
  });

  describe("stopProcessingLoop", () => {
    it("is a no-op when session is not active", () => {
      // Should not throw
      stopProcessingLoop("nonexistent-session");
    });

    it("does not start a duplicate loop for the same session", async () => {
      aituberServiceMock.getUnprocessedMessages.mockResolvedValue([]);
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      const character = makeCharacter();

      await startProcessingLoop("session-5", character as never, "room-5");
      // Calling again should be a no-op (no duplicate loop)
      await startProcessingLoop("session-5", character as never, "room-5");

      await new Promise((r) => setTimeout(r, 50));
      stopProcessingLoop("session-5");
    });
  });
});
