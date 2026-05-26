import { AIMessageChunk } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integration smoke test for the AITuber agent stream path (#M16).
 *
 * Unlike `aituber-ai-service.test.ts`, this test does **not** mock
 * `createAituberAgent` / LangGraph. It exercises the real
 * `createReactAgent` wired up with a `FakeStreamingChatModel`, then asserts
 * that the AITuber service still produces the `ai-token` / `ai-complete`
 * events the LiveKit data channel contract promises viewers.
 *
 * Purpose: catch breaking changes in the LangGraph chunk shape (e.g.
 * `_getType` / `tool_calls` / `tool_call_chunks`) the next time
 * `@langchain/langgraph` is upgraded — the rest of the suite mocks those
 * shapes away.
 *
 * All IO is stubbed (DB, LiveKit, TTS, RAG); the LLM is local and
 * deterministic via `FakeStreamingChatModel`.
 */

const {
  aituberServiceMock,
  ttsServiceMock,
  livekitServiceMock,
  initLlmWithSettingsMock,
  getUserByIdMock,
  searchVisibleChunksMock,
  searchDriveForUserMock,
  driveSettingsMock,
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
  getUserByIdMock: vi.fn(),
  searchVisibleChunksMock: vi.fn(),
  searchDriveForUserMock: vi.fn(),
  driveSettingsMock: {
    getResolvedDriveSettings: vi.fn(),
  },
}));

vi.mock("./aituber-service.js", () => aituberServiceMock);
vi.mock("./aituber-tts-service.js", () => ttsServiceMock);
vi.mock("./aituber-livekit-service.js", () => livekitServiceMock);

vi.mock("../../ai/providers/index.js", () => ({
  defaultLlmProvider: { init: initLlmWithSettingsMock },
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

vi.mock("../admin/drive-settings-service.js", () => driveSettingsMock);

// Stub the heavy wiki/drive tool factories so we don't drag in real DB clients.
// We still get the tool *names* into the agent so `bindTools` exercises real code.
vi.mock("../../ai/tools/ai-chat-tools.js", () => ({
  createAiChatSearchTool: () => ({
    searchTool: makeFakeTool("wiki_search"),
    referencedPages: [],
  }),
  createAiChatListPagesTool: () => ({
    listPagesTool: makeFakeTool("wiki_list_pages"),
    referencedPages: [],
  }),
  createAiChatReadPageTool: () => ({
    readPageTool: makeFakeTool("wiki_read_page"),
    referencedPages: [],
  }),
}));

vi.mock("../../ai/tools/ai-chat-drive-tools.js", () => ({
  createAiChatDriveSearchTool: () => ({
    driveSearchTool: makeFakeTool("drive_search"),
    referencedFiles: [],
  }),
  createAiChatDriveReadTool: () => ({
    driveReadTool: makeFakeTool("drive_read"),
    referencedFiles: [],
  }),
}));

import type { DynamicStructuredTool } from "@langchain/core/tools";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { _seedMotionRegistry, clearMotionRegistryCache } from "./motion-registry.js";

// The exact generic params on `tool()` vs `DynamicStructuredTool` don't line
// up perfectly across @langchain/core releases — `as unknown as` keeps the
// cast localised to the test fake.
function makeFakeTool(name: string): DynamicStructuredTool {
  return tool(async () => `${name} result`, {
    name,
    description: `${name} (fake)`,
    schema: z.object({ query: z.string().optional() }),
  }) as unknown as DynamicStructuredTool;
}

const TEST_MOTION_MANIFEST = {
  clips: [{ id: "nod-gentle-1", file: "nod-gentle-1.vrma", category: "nod", description: "nod" }],
};

import { notifyNewMessage, startProcessingLoop, stopProcessingLoop } from "./aituber-ai-service.js";

const character = {
  id: "char-int-1",
  name: "Aiko",
  personality: "Friendly",
  systemPrompt: "You are a virtual streamer.",
  speakingStyle: "casual",
  languageCode: "ja-JP",
  voiceName: "voice-1",
  avatarUrl: null,
  isPublic: false,
  createdBy: "user-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const viewerMsg = {
  id: "msg-int-1",
  sessionId: "session-int-1",
  role: "viewer" as const,
  senderUserId: "user-1",
  senderName: "Taro",
  content: "Hi!",
  processedAt: null,
  createdAt: new Date("2026-01-01"),
};

describe("aituber agent integration (real LangGraph, fake LLM)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    for (const m of Object.values(aituberServiceMock)) m.mockReset();
    for (const m of Object.values(ttsServiceMock)) m.mockReset();
    for (const m of Object.values(livekitServiceMock)) m.mockReset();
    initLlmWithSettingsMock.mockReset();
    getUserByIdMock.mockReset();
    searchVisibleChunksMock.mockReset();
    searchDriveForUserMock.mockReset();
    driveSettingsMock.getResolvedDriveSettings.mockReset();

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
    driveSettingsMock.getResolvedDriveSettings.mockResolvedValue({
      enabled: false,
      sharedDriveIds: [],
    });

    clearMotionRegistryCache();
    _seedMotionRegistry(TEST_MOTION_MANIFEST);

    aituberServiceMock.listUnprocessedMessages
      .mockResolvedValueOnce([viewerMsg])
      .mockResolvedValue([]);
    aituberServiceMock.markMessageProcessed.mockResolvedValue(undefined);
    aituberServiceMock.listMessageHistory.mockResolvedValue([]);
    aituberServiceMock.saveAssistantMessage.mockResolvedValue(undefined);

    ttsServiceMock.splitIntoSentences.mockReturnValue(["hello"]);
    ttsServiceMock.synthesizeSpeech.mockResolvedValue({
      audio: Buffer.from("a"),
      mimeType: "audio/mp3",
      visemes: [],
    });
    livekitServiceMock.sendDataToRoom.mockResolvedValue(undefined);
  });

  it("streams an AI text chunk through the real ReAct agent and emits ai-token + ai-complete", async () => {
    // FakeStreamingChatModel emits two AIMessageChunks — content only, no tool calls.
    // The real LangGraph agent decides "ai" → stop (no tool calls) → return.
    const fakeModel = new FakeStreamingChatModel({
      sleep: 0,
      chunks: [new AIMessageChunk({ content: "[emotion:happy:0.7] hello" })],
    });

    initLlmWithSettingsMock.mockResolvedValue({ model: fakeModel, provider: "fake" });

    startProcessingLoop("session-int-1", character as never, "room-int-1");
    notifyNewMessage("session-int-1");

    // The agent runs real LangGraph; allow generous time for stream completion.
    await new Promise((r) => setTimeout(r, 500));
    stopProcessingLoop("session-int-1");
    await new Promise((r) => setTimeout(r, 100));

    const events = (
      livekitServiceMock.sendDataToRoom.mock.calls as [string, Record<string, unknown>][]
    ).map(([, data]) => data);

    // The data-channel contract we promise viewers:
    //   * at least one ai-token chunk during streaming
    //   * exactly one ai-complete at the end, carrying the cleaned text
    const tokens = events.filter((e) => e.type === "ai-token");
    expect(tokens.length).toBeGreaterThan(0);

    const completes = events.filter((e) => e.type === "ai-complete");
    expect(completes).toHaveLength(1);
    expect(completes[0]?.fullContent).toBe("hello");

    // The assistant message was persisted with the annotation tags stripped.
    expect(aituberServiceMock.saveAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: "hello" })
    );
  }, 10_000);
});
