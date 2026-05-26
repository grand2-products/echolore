import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  aituberServiceMock,
  ttsServiceMock,
  livekitServiceMock,
  initLlmWithSettingsMock,
  chatModelMock,
  getUserByIdMock,
  searchVisibleChunksMock,
  searchDriveForUserMock,
  createAituberAgentMock,
  agentStreamMock,
} = vi.hoisted(() => ({
  aituberServiceMock: {
    listUnprocessedMessages: vi.fn(),
    markMessageProcessed: vi.fn(),
    saveAssistantMessage: vi.fn(),
    listMessageHistory: vi.fn(),
    stopSession: vi.fn(),
    abortSession: vi.fn(),
  },
  ttsServiceMock: {
    splitIntoSentences: vi.fn(),
    synthesizeSpeech: vi.fn(),
  },
  livekitServiceMock: {
    sendDataToRoom: vi.fn(),
    deleteAituberRoom: vi.fn(),
  },
  initLlmWithSettingsMock: vi.fn(),
  chatModelMock: {
    stream: vi.fn(),
  },
  getUserByIdMock: vi.fn(),
  searchVisibleChunksMock: vi.fn(),
  searchDriveForUserMock: vi.fn(),
  createAituberAgentMock: vi.fn(),
  agentStreamMock: vi.fn(),
}));

vi.mock("./aituber-service.js", () => aituberServiceMock);

vi.mock("./aituber-tts-service.js", () => ttsServiceMock);

vi.mock("./aituber-livekit-service.js", () => livekitServiceMock);

vi.mock("../../ai/providers/index.js", () => ({
  defaultLlmProvider: {
    init: initLlmWithSettingsMock,
  },
}));

vi.mock("../../repositories/user/user-repository.js", () => ({
  getUserById: getUserByIdMock,
}));

vi.mock("../wiki/vector-search-service.js", () => ({
  searchVisibleChunks: searchVisibleChunksMock,
}));

vi.mock("../drive/drive-vector-search-service.js", () => ({
  searchDriveForUser: searchDriveForUserMock,
}));

vi.mock("../../ai/agent/create-aituber-agent.js", () => ({
  createAituberAgent: createAituberAgentMock,
}));

// AI Chat tools build DynamicStructuredTool instances at module load — mock
// them out so we don't drag in @langchain dependencies during the test.
vi.mock("../../ai/tools/ai-chat-tools.js", () => ({
  createAiChatSearchTool: () => ({ searchTool: { name: "wiki_search" }, referencedPages: [] }),
  createAiChatListPagesTool: () => ({
    listPagesTool: { name: "wiki_list_pages" },
    referencedPages: [],
  }),
  createAiChatReadPageTool: () => ({
    readPageTool: { name: "wiki_read_page" },
    referencedPages: [],
  }),
}));

vi.mock("../../ai/tools/ai-chat-drive-tools.js", () => ({
  createAiChatDriveSearchTool: () => ({
    driveSearchTool: { name: "drive_search" },
    referencedFiles: [],
  }),
  createAiChatDriveReadTool: () => ({
    driveReadTool: { name: "drive_read" },
    referencedFiles: [],
  }),
}));

vi.mock("../../ai/tools/user-lookup-tool.js", () => ({
  createUserLookupTool: () => ({ name: "lookup_user" }),
}));

const driveSettingsMock = vi.hoisted(() => ({
  getResolvedDriveSettings: vi.fn(),
}));
vi.mock("../admin/drive-settings-service.js", () => driveSettingsMock);

/**
 * Helper: configure what the next `agent.stream()` call yields.
 * Pass an array of plain strings — each becomes an AI message chunk token.
 */
function setAgentTokens(tokens: string[]): void {
  agentStreamMock.mockResolvedValueOnce(
    (async function* () {
      for (const token of tokens) {
        yield [
          {
            _getType: () => "ai",
            content: token,
            tool_calls: [],
            tool_call_chunks: [],
          },
          {},
        ];
      }
    })()
  );
}

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

import {
  notifyNewMessage,
  parseAnnotations,
  startProcessingLoop,
  stopProcessingLoop,
} from "./aituber-ai-service.js";
import { _seedMotionRegistry, clearMotionRegistryCache } from "./motion-registry.js";

const TEST_MOTION_MANIFEST = {
  clips: [
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
    "greeting-wave-casual",
  ].map((id) => ({
    id,
    file: `${id}.vrma`,
    category: id.split("-")[0] ?? "misc",
    description: id,
  })),
};

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
    aituberServiceMock.listUnprocessedMessages.mockReset();
    aituberServiceMock.markMessageProcessed.mockReset();
    aituberServiceMock.saveAssistantMessage.mockReset();
    aituberServiceMock.listMessageHistory.mockReset();
    aituberServiceMock.stopSession.mockReset();
    aituberServiceMock.abortSession.mockReset();
    ttsServiceMock.splitIntoSentences.mockReset();
    ttsServiceMock.synthesizeSpeech.mockReset();
    livekitServiceMock.sendDataToRoom.mockReset();
    livekitServiceMock.deleteAituberRoom.mockReset();
    initLlmWithSettingsMock.mockReset();
    chatModelMock.stream.mockReset();
    getUserByIdMock.mockReset();
    searchVisibleChunksMock.mockReset();
    searchDriveForUserMock.mockReset();

    // Default: viewer resolves to a valid member user and RAG returns nothing.
    getUserByIdMock.mockResolvedValue({
      id: "user-1",
      email: "taro@example.com",
      name: "Taro",
      role: "member",
      avatarUrl: null,
      deletedAt: null,
      suspendedAt: null,
    });
    searchVisibleChunksMock.mockResolvedValue({ results: [], searchMode: "vector" });
    searchDriveForUserMock.mockResolvedValue([]);

    // Seed the motion registry so parseAnnotations() recognises action IDs
    // and the agent's actionListing is populated, without touching the filesystem.
    clearMotionRegistryCache();
    _seedMotionRegistry(TEST_MOTION_MANIFEST);

    driveSettingsMock.getResolvedDriveSettings.mockReset();
    // Default: Drive integration disabled, so drive_search / drive_read are
    // not appended to the agent's tools.
    driveSettingsMock.getResolvedDriveSettings.mockResolvedValue({
      enabled: false,
      sharedDriveIds: [],
    });

    createAituberAgentMock.mockReset();
    agentStreamMock.mockReset();
    // Default: a single "OK" token, no tool calls.
    agentStreamMock.mockImplementation(async () =>
      (async function* () {
        yield [{ _getType: () => "ai", content: "OK", tool_calls: [], tool_call_chunks: [] }, {}];
      })()
    );
    createAituberAgentMock.mockReturnValue({ stream: agentStreamMock });
  });

  describe("agent persona (via generateStreamingResponse)", () => {
    it("passes character name, personality, and speaking style to createAituberAgent", async () => {
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
      });

      setAgentTokens(["Hello ", "there!"]);

      ttsServiceMock.splitIntoSentences.mockReturnValue(["Hello there!"]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("audio"),
        mimeType: "audio/mp3",
        visemes: [],
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-1", character as never, "room-1");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-1");

      expect(createAituberAgentMock).toHaveBeenCalledTimes(1);
      const agentInput = createAituberAgentMock.mock.calls[0]?.[0];
      expect(agentInput?.character).toEqual({
        name: "TestChar",
        personality: "Friendly",
        systemPrompt: "You are a helpful character.",
        speakingStyle: "polite",
      });
      // Action listing should be wired up from ACTION_REGISTRY.
      expect(agentInput?.actionListing).toContain("greeting:");
      expect(agentInput?.actionListing).toContain("idle:");
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

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue(historyMessages);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({
        model: chatModelMock,
        provider: "gemini",
      });

      setAgentTokens(["Response"]);

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

      // Agent receives the history (no SystemMessage — createAituberAgent
      // attaches the system prompt internally via createReactAgent's `prompt`).
      expect(agentStreamMock).toHaveBeenCalledTimes(1);
      const { messages } = agentStreamMock.mock.calls[0]?.[0] as {
        messages: Array<{ content: string }>;
      };
      expect(messages).toHaveLength(3);
      expect(messages[0]?.content).toBe("[Hanako] Previous question");
      expect(messages[1]?.content).toBe("Previous answer");
      expect(messages[2]?.content).toBe("[Taro] Hello!");
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
      });

      agentStreamMock.mockRejectedValueOnce(new Error("LLM provider error"));
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
      });

      setAgentTokens(["OK"]);

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

  describe("event-driven worker (regression: must wake on notify, not poll)", () => {
    it("does not query the DB on a fixed interval — only after notifyNewMessage", async () => {
      // Empty queue; the worker should call listUnprocessedMessages once at
      // startup, find nothing, then sleep on the channel until notified.
      aituberServiceMock.listUnprocessedMessages.mockResolvedValue([]);
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      const character = makeCharacter();
      await startProcessingLoop("session-evt-1", character as never, "room-evt-1");

      // After 1500ms (well past the old 1s poll cadence) we expect only the
      // initial drain — no repeated polling.
      await new Promise((r) => setTimeout(r, 1500));
      const callsBeforeNotify = aituberServiceMock.listUnprocessedMessages.mock.calls.length;
      expect(callsBeforeNotify).toBe(1);

      // Notify → worker wakes and queries again.
      notifyNewMessage("session-evt-1");
      await new Promise((r) => setTimeout(r, 100));
      expect(aituberServiceMock.listUnprocessedMessages.mock.calls.length).toBeGreaterThan(
        callsBeforeNotify
      );

      stopProcessingLoop("session-evt-1");
      await new Promise((r) => setTimeout(r, 50));
    });

    it("drains all queued messages on a single notify before waiting again", async () => {
      const character = makeCharacter();
      const m1 = makeViewerMessage({ id: "m1", content: "first" });
      const m2 = makeViewerMessage({ id: "m2", content: "second" });

      // Two pending messages, then empty.
      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([m1])
        .mockResolvedValueOnce([m2])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);
      initLlmWithSettingsMock.mockResolvedValue({ model: chatModelMock, provider: "gemini" });
      chatModelMock.stream.mockImplementation(async () =>
        (async function* () {
          yield { content: "OK" };
        })()
      );
      ttsServiceMock.splitIntoSentences.mockReturnValue(["OK"]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("a"),
        mimeType: "audio/mp3",
        visemes: [],
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-evt-2", character as never, "room-evt-2");
      await new Promise((r) => setTimeout(r, 200));

      // Both messages should have been processed without needing extra notifies.
      expect(aituberServiceMock.saveAssistantMessage).toHaveBeenCalledTimes(2);

      stopProcessingLoop("session-evt-2");
      await new Promise((r) => setTimeout(r, 50));
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

  describe("RAG permission scoping (regression: viewers must not bypass page permissions)", () => {
    it("passes the viewer's SessionUser to searchVisibleChunks", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage({ senderUserId: "user-42", content: "secret topic" });

      getUserByIdMock.mockResolvedValueOnce({
        id: "user-42",
        email: "hanako@example.com",
        name: "Hanako",
        role: "member",
        avatarUrl: null,
        deletedAt: null,
        suspendedAt: null,
      });

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({ model: chatModelMock, provider: "gemini" });
      setAgentTokens(["OK"]);
      ttsServiceMock.splitIntoSentences.mockReturnValue(["OK"]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("audio"),
        mimeType: "audio/mp3",
        visemes: [],
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-rag-1", character as never, "room-rag-1");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-rag-1");

      expect(searchVisibleChunksMock).toHaveBeenCalledTimes(1);
      const [viewerArg, queryArg] = searchVisibleChunksMock.mock.calls[0] ?? [];
      expect(viewerArg).toMatchObject({ id: "user-42", email: "hanako@example.com" });
      expect(queryArg).toBe("secret topic");

      expect(searchDriveForUserMock).toHaveBeenCalledTimes(1);
      expect(searchDriveForUserMock.mock.calls[0]?.[0]).toBe("hanako@example.com");
    });

    it("skips RAG entirely when the viewer cannot be resolved (no admin-scoped fallback)", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage({ senderUserId: "ghost", content: "anything" });

      // Viewer no longer in DB
      getUserByIdMock.mockResolvedValueOnce(null);

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({ model: chatModelMock, provider: "gemini" });
      setAgentTokens(["OK"]);
      ttsServiceMock.splitIntoSentences.mockReturnValue(["OK"]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("a"),
        mimeType: "audio/mp3",
        visemes: [],
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-rag-2", character as never, "room-rag-2");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-rag-2");

      // Neither search must run when the viewer is unknown.
      expect(searchVisibleChunksMock).not.toHaveBeenCalled();
      expect(searchDriveForUserMock).not.toHaveBeenCalled();
    });

    it("skips RAG when the viewer is suspended or deleted", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage({ senderUserId: "user-99" });

      getUserByIdMock.mockResolvedValueOnce({
        id: "user-99",
        email: "x@example.com",
        name: "X",
        role: "member",
        avatarUrl: null,
        deletedAt: new Date("2026-04-01"),
        suspendedAt: null,
      });

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({ model: chatModelMock, provider: "gemini" });
      setAgentTokens(["OK"]);
      ttsServiceMock.splitIntoSentences.mockReturnValue(["OK"]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("a"),
        mimeType: "audio/mp3",
        visemes: [],
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-rag-3", character as never, "room-rag-3");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-rag-3");

      expect(searchVisibleChunksMock).not.toHaveBeenCalled();
      expect(searchDriveForUserMock).not.toHaveBeenCalled();
    });
  });

  describe("loop self-abort (regression: session must not stay live)", () => {
    it("transitions session to ended and tears down LiveKit room after 10 consecutive errors", async () => {
      const character = makeCharacter();

      // Every poll throws — drives consecutiveErrors past MAX_CONSECUTIVE_ERRORS.
      aituberServiceMock.listUnprocessedMessages.mockRejectedValue(new Error("DB down"));
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);
      aituberServiceMock.stopSession.mockResolvedValue({ id: "session-fail", status: "ended" });
      livekitServiceMock.deleteAituberRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-fail", character as never, "room-fail");

      // 10 errors × 1s sleep = ~10s. Wait a little longer to ensure teardown ran.
      await new Promise((r) => setTimeout(r, 11000));

      // After abort: session must be transitioned to `ended` and the LiveKit room deleted.
      expect(aituberServiceMock.stopSession).toHaveBeenCalledWith("session-fail");
      expect(livekitServiceMock.deleteAituberRoom).toHaveBeenCalledWith("room-fail");

      // A `session-aborted` event must be broadcast so viewers see the state change.
      const events = (
        livekitServiceMock.sendDataToRoom.mock.calls as [string, Record<string, unknown>][]
      ).map(([, data]) => data.type);
      expect(events).toContain("session-aborted");
    }, 15000);
  });

  describe("citations on ai-complete", () => {
    it("includes Wiki and Drive sources in the ai-complete data event", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage();

      // Drive a non-empty RAG result so citations get populated.
      searchVisibleChunksMock.mockResolvedValueOnce({
        results: [
          {
            pageId: "page-A",
            pageTitle: "Onboarding",
            chunkText: "Welcome to the team.",
            similarity: 0.91,
          },
          {
            pageId: "page-B",
            pageTitle: "Holidays",
            chunkText: "PTO policy summary.",
            similarity: 0.83,
          },
        ],
        searchMode: "vector",
      });
      searchDriveForUserMock.mockResolvedValueOnce([
        {
          fileId: "drive-1",
          fileName: "Q3 OKRs.pdf",
          webViewLink: "https://drive.example/q3",
          chunkText: "Q3 objectives.",
          similarity: 0.78,
        },
      ]);

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({ model: chatModelMock, provider: "gemini" });
      setAgentTokens(["Here's an answer based on the docs."]);
      ttsServiceMock.splitIntoSentences.mockReturnValue(["Here's an answer based on the docs."]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("a"),
        mimeType: "audio/mp3",
        visemes: [],
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-cite-1", character as never, "room-cite-1");
      await new Promise((r) => setTimeout(r, 150));
      stopProcessingLoop("session-cite-1");

      const completeEvent = (
        livekitServiceMock.sendDataToRoom.mock.calls as [string, Record<string, unknown>][]
      )
        .map(([, data]) => data)
        .find((d) => d.type === "ai-complete");

      expect(completeEvent).toBeDefined();
      const citations = completeEvent?.citations as Array<Record<string, unknown>>;
      expect(citations).toHaveLength(3);
      expect(citations[0]).toMatchObject({
        source: "wiki",
        pageId: "page-A",
        pageTitle: "Onboarding",
      });
      expect(citations[2]).toMatchObject({
        source: "drive",
        fileId: "drive-1",
        fileName: "Q3 OKRs.pdf",
        webViewLink: "https://drive.example/q3",
      });
    });

    it("emits an ai-complete event with empty citations when RAG returned nothing", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage();

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({ model: chatModelMock, provider: "gemini" });
      setAgentTokens(["Plain answer."]);
      ttsServiceMock.splitIntoSentences.mockReturnValue(["Plain answer."]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("a"),
        mimeType: "audio/mp3",
        visemes: [],
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-cite-2", character as never, "room-cite-2");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-cite-2");

      const completeEvent = (
        livekitServiceMock.sendDataToRoom.mock.calls as [string, Record<string, unknown>][]
      )
        .map(([, data]) => data)
        .find((d) => d.type === "ai-complete");

      expect(completeEvent).toBeDefined();
      expect(completeEvent?.citations).toEqual([]);
    });
  });

  describe("ReAct agent tool exposure (regression: viewer scope governs tools)", () => {
    it("hands the agent the 3 viewer-scoped Wiki tools when the viewer is resolved", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage();

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({ model: chatModelMock, provider: "gemini" });
      ttsServiceMock.splitIntoSentences.mockReturnValue(["OK"]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("a"),
        mimeType: "audio/mp3",
        visemes: [],
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-tools-1", character as never, "room-tools-1");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-tools-1");

      expect(createAituberAgentMock).toHaveBeenCalledTimes(1);
      const agentInput = createAituberAgentMock.mock.calls[0]?.[0];
      const toolNames = (agentInput?.tools as Array<{ name: string }>).map((t) => t.name).sort();
      // Wiki 3 + lookup_user = 4 (Drive disabled by default in tests)
      expect(toolNames).toEqual([
        "lookup_user",
        "wiki_list_pages",
        "wiki_read_page",
        "wiki_search",
      ]);
    });

    it("appends drive_search / drive_read when Drive integration is enabled", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage();

      driveSettingsMock.getResolvedDriveSettings.mockResolvedValueOnce({
        enabled: true,
        sharedDriveIds: ["drive-1"],
      });

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({ model: chatModelMock, provider: "gemini" });
      ttsServiceMock.splitIntoSentences.mockReturnValue(["OK"]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("a"),
        mimeType: "audio/mp3",
        visemes: [],
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-drive-1", character as never, "room-drive-1");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-drive-1");

      const agentInput = createAituberAgentMock.mock.calls[0]?.[0];
      const toolNames = (agentInput?.tools as Array<{ name: string }>).map((t) => t.name).sort();
      expect(toolNames).toEqual([
        "drive_read",
        "drive_search",
        "lookup_user",
        "wiki_list_pages",
        "wiki_read_page",
        "wiki_search",
      ]);
    });

    it("falls back gracefully when getResolvedDriveSettings throws", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage();

      driveSettingsMock.getResolvedDriveSettings.mockRejectedValueOnce(
        new Error("settings service down")
      );

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({ model: chatModelMock, provider: "gemini" });
      ttsServiceMock.splitIntoSentences.mockReturnValue(["OK"]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("a"),
        mimeType: "audio/mp3",
        visemes: [],
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-drive-2", character as never, "room-drive-2");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-drive-2");

      // Wiki + lookup still work even if Drive settings throw.
      const agentInput = createAituberAgentMock.mock.calls[0]?.[0];
      const toolNames = (agentInput?.tools as Array<{ name: string }>).map((t) => t.name).sort();
      expect(toolNames).toEqual([
        "lookup_user",
        "wiki_list_pages",
        "wiki_read_page",
        "wiki_search",
      ]);
    });

    it("hands the agent no tools when the viewer cannot be resolved (no permission to scope by)", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage({ senderUserId: "ghost" });

      getUserByIdMock.mockResolvedValueOnce(null);

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({ model: chatModelMock, provider: "gemini" });
      ttsServiceMock.splitIntoSentences.mockReturnValue(["OK"]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("a"),
        mimeType: "audio/mp3",
        visemes: [],
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-tools-2", character as never, "room-tools-2");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-tools-2");

      expect(createAituberAgentMock).toHaveBeenCalledTimes(1);
      const agentInput = createAituberAgentMock.mock.calls[0]?.[0];
      expect(agentInput?.tools).toEqual([]);
    });

    it("drops tool-call AI chunks from the token stream so viewers only hear text", async () => {
      const character = makeCharacter();
      const viewerMsg = makeViewerMessage();

      // Mix of a tool-call chunk (must be skipped) and a content chunk.
      agentStreamMock.mockResolvedValueOnce(
        (async function* () {
          yield [
            {
              _getType: () => "ai",
              content: "",
              tool_calls: [{ name: "wiki_search", args: { query: "x" }, id: "1" }],
              tool_call_chunks: [],
            },
            {},
          ];
          // Tool result is a non-AI message — must also be skipped.
          yield [{ _getType: () => "tool", content: "search result" }, {}];
          yield [
            {
              _getType: () => "ai",
              content: "final answer",
              tool_calls: [],
              tool_call_chunks: [],
            },
            {},
          ];
        })()
      );

      aituberServiceMock.listUnprocessedMessages
        .mockResolvedValueOnce([viewerMsg])
        .mockResolvedValue([]);
      aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
      aituberServiceMock.listMessageHistory.mockResolvedValue([]);
      aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

      initLlmWithSettingsMock.mockResolvedValue({ model: chatModelMock, provider: "gemini" });
      ttsServiceMock.splitIntoSentences.mockReturnValue(["final answer"]);
      ttsServiceMock.synthesizeSpeech.mockResolvedValue({
        audio: Buffer.from("a"),
        mimeType: "audio/mp3",
        visemes: [],
      });
      livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);

      await startProcessingLoop("session-tools-3", character as never, "room-tools-3");
      await new Promise((r) => setTimeout(r, 100));
      stopProcessingLoop("session-tools-3");

      const tokenEvents = (
        livekitServiceMock.sendDataToRoom.mock.calls as [string, Record<string, unknown>][]
      )
        .map(([, data]) => data)
        .filter((d) => d.type === "ai-token");

      expect(tokenEvents).toHaveLength(1);
      expect(tokenEvents[0]?.token).toBe("final answer");
    });
  });
});
