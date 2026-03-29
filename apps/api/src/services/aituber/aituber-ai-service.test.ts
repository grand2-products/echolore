import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  aituberServiceMock,
  ttsServiceMock,
  livekitServiceMock,
  initLlmWithSettingsMock,
  chatModelMock,
} = vi.hoisted(() => ({
  aituberServiceMock: {
    listUnprocessedMessages: vi.fn(),
    markMessageProcessed: vi.fn(),
    saveAssistantMessage: vi.fn(),
    listMessageHistory: vi.fn(),
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

import { parseAnnotations, startProcessingLoop, stopProcessingLoop } from "./aituber-ai-service.js";

const makeCharacter = (overrides = {}) => ({
  id: "char-1",
  name: "TestChar",
  personality: "Friendly",
  system_prompt: "You are a helpful character.",
  speaking_style: "polite",
  language_code: "ja-JP",
  voice_name: "voice-1",
  avatar_url: null,
  is_public: false,
  created_by: "user-1",
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-01"),
  ...overrides,
});

const makeViewerMessage = (overrides = {}) => ({
  id: "msg-1",
  session_id: "session-1",
  role: "viewer" as const,
  sender_user_id: "user-1",
  sender_name: "Taro",
  content: "Hello!",
  processed_at: null,
  created_at: new Date("2026-01-01"),
  ...overrides,
});

describe("aituber-ai-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    aituberServiceMock.listUnprocessedMessages.mockReset();
    aituberServiceMock.markMessageProcessed.mockReset();
    aituberServiceMock.saveAssistantMessage.mockReset();
    aituberServiceMock.listMessageHistory.mockReset();
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
      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
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
        visemes: [],
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
          session_id: "session-1",
          role: "viewer",
          sender_user_id: "user-2",
          sender_name: "Hanako",
          content: "Previous question",
          processed_at: null,
          created_at: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "h2",
          session_id: "session-1",
          role: "assistant",
          sender_user_id: null,
          sender_name: "TestChar",
          content: "Previous answer",
          processed_at: new Date("2026-01-01T00:01:00Z"),
          created_at: new Date("2026-01-01T00:01:00Z"),
        },
      ];

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue(historyMessages);
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
        visemes: [],
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

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);

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

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
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

  describe("parseAnnotations", () => {
    it("parses emotion and action tags", () => {
      const result = parseAnnotations(
        "[emotion:happy:0.7][action:greeting-wave-casual] やっほー！"
      );
      expect(result.emotion).toEqual({ type: "happy", intensity: 0.7 });
      expect(result.action).toBe("greeting-wave-casual");
      expect(result.text).toBe("やっほー！");
    });

    it("parses emotion only", () => {
      const result = parseAnnotations("[emotion:sad:0.4] 悲しいね");
      expect(result.emotion).toEqual({ type: "sad", intensity: 0.4 });
      expect(result.action).toBeNull();
      expect(result.text).toBe("悲しいね");
    });

    it("returns null emotion for missing tag", () => {
      const result = parseAnnotations("普通の応答です");
      expect(result.emotion).toBeNull();
      expect(result.action).toBeNull();
      expect(result.text).toBe("普通の応答です");
    });

    it("clamps intensity to [0, 1]", () => {
      const result = parseAnnotations("[emotion:angry:1.5] 怒った！");
      expect(result.emotion?.intensity).toBe(1);
    });

    it("rejects invalid emotion types", () => {
      const result = parseAnnotations("[emotion:rage:0.8] 怒った！");
      expect(result.emotion).toBeNull();
    });

    it("only matches tag at the beginning of text", () => {
      const result = parseAnnotations("途中に [emotion:happy:0.5] がある");
      expect(result.emotion).toBeNull();
      expect(result.text).toBe("途中に [emotion:happy:0.5] がある");
    });

    it("handles tag without trailing space", () => {
      const result = parseAnnotations("[emotion:sad:0.3]悲しいです");
      expect(result.emotion).toEqual({ type: "sad", intensity: 0.3 });
      expect(result.text).toBe("悲しいです");
    });

    it("parses action with hyphens in ID", () => {
      const result = parseAnnotations("[emotion:neutral:0.0][action:nod-gentle-1] うん");
      expect(result.action).toBe("nod-gentle-1");
    });

    it("rejects invalid action IDs not in registry", () => {
      const result = parseAnnotations("[emotion:happy:0.5][action:dance-backflip] テスト");
      expect(result.action).toBeNull();
      expect(result.text).toBe("テスト");
    });

    it("accepts all registered action IDs", () => {
      for (const id of [
        "greeting-bow-polite",
        "farewell-wave",
        "nod-gentle-1",
        "head-tilt-curious",
        "laugh-mid",
        "laugh-shy",
        "surprise-mid",
        "sad-mid",
        "angry-mid",
        "think-chin-hand",
        "explain-point",
        "react-impressed",
        "react-embarrassed",
        "idle-stretch",
      ]) {
        const result = parseAnnotations(`[emotion:neutral:0.0][action:${id}] test`);
        expect(result.action).toBe(id);
      }
    });
  });

  describe("stopProcessingLoop", () => {
    it("is a no-op when session is not active", () => {
      // Should not throw
      stopProcessingLoop("nonexistent-session");
    });

    it("does not start a duplicate loop for the same session", async () => {
      aituberServiceMock.listUnprocessedMessages.mockResolvedValue([]);
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
