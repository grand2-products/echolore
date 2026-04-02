import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createMessageMock,
  getConversationByIdMock,
  listRecentMessagesMock,
  updateConversationMock,
  initLlmWithSettingsMock,
  searchVisibleChunksMock,
  searchDriveForUserMock,
  getResolvedDriveSettingsMock,
  createAiChatAgentMock,
  createAiChatSearchToolMock,
  createAiChatListPagesToolMock,
  createAiChatReadPageToolMock,
  createAiChatDriveSearchToolMock,
  createAiChatDriveReadToolMock,
} = vi.hoisted(() => ({
  createMessageMock: vi.fn(),
  getConversationByIdMock: vi.fn(),
  listRecentMessagesMock: vi.fn(),
  updateConversationMock: vi.fn(),
  initLlmWithSettingsMock: vi.fn(),
  searchVisibleChunksMock: vi.fn(),
  searchDriveForUserMock: vi.fn(),
  getResolvedDriveSettingsMock: vi.fn(),
  createAiChatAgentMock: vi.fn(),
  createAiChatSearchToolMock: vi.fn(),
  createAiChatListPagesToolMock: vi.fn(),
  createAiChatReadPageToolMock: vi.fn(),
  createAiChatDriveSearchToolMock: vi.fn(),
  createAiChatDriveReadToolMock: vi.fn(),
}));

vi.mock("../../repositories/ai-chat/ai-chat-repository.js", () => ({
  createMessage: createMessageMock,
  getConversationById: getConversationByIdMock,
  listRecentMessages: listRecentMessagesMock,
  updateConversation: updateConversationMock,
}));

vi.mock("../wiki/vector-search-service.js", () => ({
  searchVisibleChunks: searchVisibleChunksMock,
}));

vi.mock("../drive/drive-vector-search-service.js", () => ({
  searchDriveForUser: searchDriveForUserMock,
}));

vi.mock("../admin/drive-settings-service.js", () => ({
  getResolvedDriveSettings: getResolvedDriveSettingsMock,
}));

vi.mock("../../ai/llm/index.js", () => ({
  initLlmWithSettings: initLlmWithSettingsMock,
}));

vi.mock("../../ai/agent/create-ai-chat-agent.js", () => ({
  createAiChatAgent: createAiChatAgentMock,
}));

vi.mock("../../ai/tools/ai-chat-tools.js", () => ({
  createAiChatSearchTool: createAiChatSearchToolMock,
  createAiChatListPagesTool: createAiChatListPagesToolMock,
  createAiChatReadPageTool: createAiChatReadPageToolMock,
}));

vi.mock("../../ai/tools/ai-chat-drive-tools.js", () => ({
  createAiChatDriveSearchTool: createAiChatDriveSearchToolMock,
  createAiChatDriveReadTool: createAiChatDriveReadToolMock,
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-nanoid-id"),
}));

describe("ai-chat-ai-service", () => {
  const testUser = {
    id: "user-1",
    email: "test@test.com",
    name: "Test User",
    role: "member" as const,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    createMessageMock.mockReset();
    getConversationByIdMock.mockReset();
    listRecentMessagesMock.mockReset();
    updateConversationMock.mockReset();
    initLlmWithSettingsMock.mockReset();
    searchVisibleChunksMock.mockReset();
    searchDriveForUserMock.mockReset();
    getResolvedDriveSettingsMock.mockReset();
    createAiChatAgentMock.mockReset();
    createAiChatSearchToolMock.mockReset();
    createAiChatListPagesToolMock.mockReset();
    createAiChatReadPageToolMock.mockReset();
    createAiChatDriveSearchToolMock.mockReset();
    createAiChatDriveReadToolMock.mockReset();
  });

  function setupDefaultMocks(opts?: { existingMessages?: unknown[] }) {
    createMessageMock
      .mockResolvedValueOnce({
        id: "msg-user",
        conversationId: "conv-1",
        role: "user",
        content: "Hello",
      })
      .mockResolvedValueOnce({
        id: "msg-assistant",
        conversationId: "conv-1",
        role: "assistant",
        content: "Hi there!",
      });
    listRecentMessagesMock.mockResolvedValue(opts?.existingMessages ?? []);
    updateConversationMock.mockResolvedValue({});
    getConversationByIdMock.mockResolvedValue({
      id: "conv-1",
      title: "New Chat",
      creatorId: "user-1",
    });
    initLlmWithSettingsMock.mockResolvedValue({
      model: {},
      provider: "gemini",
      overrides: {},
    });
    searchVisibleChunksMock.mockResolvedValue({ results: [], searchMode: "vector" });
    searchDriveForUserMock.mockResolvedValue([]);
    getResolvedDriveSettingsMock.mockResolvedValue({
      enabled: false,
      sharedDriveIds: [],
      syncIntervalMinutes: 60,
      includeMimeTypes: [],
      excludeFolderIds: [],
      maxFileSizeBytes: 10485760,
    });
    createAiChatSearchToolMock.mockReturnValue({ searchTool: {}, referencedPages: [] });
    createAiChatListPagesToolMock.mockReturnValue({ listPagesTool: {}, referencedPages: [] });
    createAiChatReadPageToolMock.mockReturnValue({ readPageTool: {}, referencedPages: [] });
    createAiChatDriveSearchToolMock.mockReturnValue({
      driveSearchTool: {},
      referencedFiles: [],
    });
    createAiChatDriveReadToolMock.mockReturnValue({ driveReadTool: {}, referencedFiles: [] });

    const fakeAgent = {
      invoke: vi.fn().mockResolvedValue({
        messages: [{ _getType: () => "ai", content: "Hi there!" }],
      }),
    };
    createAiChatAgentMock.mockReturnValue(fakeAgent);
  }

  describe("sendMessageAndGetResponse", () => {
    it("saves user message and assistant response", async () => {
      setupDefaultMocks();

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      const result = await sendMessageAndGetResponse(testUser, "conv-1", "Hello");

      expect(createMessageMock).toHaveBeenCalledTimes(2);
      expect(createMessageMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ role: "user", content: "Hello", conversationId: "conv-1" })
      );
      expect(createMessageMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          role: "assistant",
          content: "Hi there!",
          conversationId: "conv-1",
        })
      );
      expect(result.userMessage).toEqual(expect.objectContaining({ role: "user" }));
      expect(result.assistantMessage).toEqual(expect.objectContaining({ role: "assistant" }));
    });

    it("throws when user message creation fails", async () => {
      createMessageMock.mockResolvedValueOnce(null);

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      await expect(sendMessageAndGetResponse(testUser, "conv-1", "Hello")).rejects.toThrow(
        "Failed to create user message"
      );
    });

    it("updates conversation timestamp after saving messages", async () => {
      setupDefaultMocks();

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      await sendMessageAndGetResponse(testUser, "conv-1", "Hello");

      expect(updateConversationMock).toHaveBeenCalledWith(
        "conv-1",
        expect.objectContaining({ updatedAt: expect.any(Date) })
      );
    });

    it("returns unavailable message when LLM is not enabled", async () => {
      createMessageMock
        .mockResolvedValueOnce({
          id: "msg-user",
          conversationId: "conv-1",
          role: "user",
          content: "Hello",
        })
        .mockResolvedValueOnce({
          id: "msg-assistant",
          conversationId: "conv-1",
          role: "assistant",
          content: "unavailable",
        });
      listRecentMessagesMock.mockResolvedValue([]);
      updateConversationMock.mockResolvedValue({});
      getConversationByIdMock.mockResolvedValue(null);
      initLlmWithSettingsMock.mockResolvedValue(null);
      searchVisibleChunksMock.mockResolvedValue({ results: [], searchMode: "vector" });
      searchDriveForUserMock.mockResolvedValue([]);

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      await sendMessageAndGetResponse(testUser, "conv-1", "Hello");

      expect(createMessageMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          content: expect.stringContaining("unavailable"),
        })
      );
    });

    it("includes RAG citations from vector search results", async () => {
      createMessageMock
        .mockResolvedValueOnce({
          id: "msg-user",
          conversationId: "conv-1",
          role: "user",
          content: "How to deploy?",
        })
        .mockResolvedValueOnce({
          id: "msg-assistant",
          conversationId: "conv-1",
          role: "assistant",
          content: "Answer",
        });
      listRecentMessagesMock.mockResolvedValue([]);
      updateConversationMock.mockResolvedValue({});
      getConversationByIdMock.mockResolvedValue({
        id: "conv-1",
        title: "New Chat",
        creatorId: "user-1",
      });
      initLlmWithSettingsMock.mockResolvedValue({
        model: { invoke: vi.fn().mockResolvedValue({ content: "Deploy Guide Chat" }) },
        provider: "gemini",
        overrides: {},
      });
      searchVisibleChunksMock.mockResolvedValue({
        results: [
          {
            pageId: "page-1",
            pageTitle: "Deploy Guide",
            chunkText: "Step 1: ...",
            similarity: 0.9,
          },
        ],
        searchMode: "vector",
      });
      searchDriveForUserMock.mockResolvedValue([]);
      getResolvedDriveSettingsMock.mockResolvedValue({
        enabled: false,
        sharedDriveIds: [],
      });
      createAiChatSearchToolMock.mockReturnValue({ searchTool: {}, referencedPages: [] });
      createAiChatListPagesToolMock.mockReturnValue({ listPagesTool: {}, referencedPages: [] });
      createAiChatReadPageToolMock.mockReturnValue({ readPageTool: {}, referencedPages: [] });
      createAiChatAgentMock.mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          messages: [{ _getType: () => "ai", content: "Answer" }],
        }),
      });

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      await sendMessageAndGetResponse(testUser, "conv-1", "How to deploy?");

      expect(createMessageMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          citations: expect.arrayContaining([
            expect.objectContaining({ pageId: "page-1", pageTitle: "Deploy Guide" }),
          ]),
        })
      );
    });

    it("returns error message when agent invocation fails", async () => {
      createMessageMock
        .mockResolvedValueOnce({
          id: "msg-user",
          conversationId: "conv-1",
          role: "user",
          content: "Hello",
        })
        .mockResolvedValueOnce({
          id: "msg-assistant",
          conversationId: "conv-1",
          role: "assistant",
          content: "error",
        });
      listRecentMessagesMock.mockResolvedValue([]);
      updateConversationMock.mockResolvedValue({});
      getConversationByIdMock.mockResolvedValue(null);
      initLlmWithSettingsMock.mockResolvedValue({
        model: {},
        provider: "gemini",
        overrides: {},
      });
      searchVisibleChunksMock.mockResolvedValue({ results: [], searchMode: "vector" });
      searchDriveForUserMock.mockResolvedValue([]);
      getResolvedDriveSettingsMock.mockResolvedValue({
        enabled: false,
        sharedDriveIds: [],
      });
      createAiChatSearchToolMock.mockReturnValue({ searchTool: {}, referencedPages: [] });
      createAiChatListPagesToolMock.mockReturnValue({ listPagesTool: {}, referencedPages: [] });
      createAiChatReadPageToolMock.mockReturnValue({ readPageTool: {}, referencedPages: [] });
      createAiChatAgentMock.mockReturnValue({
        invoke: vi.fn().mockRejectedValue(new Error("LLM timeout")),
      });

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      await sendMessageAndGetResponse(testUser, "conv-1", "Hello");

      expect(createMessageMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          content: expect.stringContaining("error occurred"),
        })
      );
    });
  });

  describe("auto title generation", () => {
    it("generates title on first message when title is 'New Chat'", async () => {
      const fakeLlmModel = {
        invoke: vi.fn().mockResolvedValue({ content: "挨拶の会話" }),
      };
      setupDefaultMocks();
      // Override LLM to provide model for both agent and title generation
      initLlmWithSettingsMock.mockResolvedValue({
        model: fakeLlmModel,
        provider: "gemini",
        overrides: {},
      });

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      const result = await sendMessageAndGetResponse(testUser, "conv-1", "Hello");

      expect(result.generatedTitle).toBe("挨拶の会話");
      expect(updateConversationMock).toHaveBeenCalledWith(
        "conv-1",
        expect.objectContaining({ title: "挨拶の会話" })
      );
    });

    it("does not generate title when conversation already has a custom title", async () => {
      setupDefaultMocks();
      getConversationByIdMock.mockResolvedValue({
        id: "conv-1",
        title: "My Custom Title",
        creatorId: "user-1",
      });

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      const result = await sendMessageAndGetResponse(testUser, "conv-1", "Hello");

      expect(result.generatedTitle).toBeNull();
      // updateConversation should only be called once (timestamp), not for title
      expect(updateConversationMock).toHaveBeenCalledTimes(1);
    });

    it("does not generate title on subsequent messages", async () => {
      setupDefaultMocks({
        existingMessages: [
          { id: "prev-msg", conversationId: "conv-1", role: "user", content: "previous" },
        ],
      });

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      const result = await sendMessageAndGetResponse(testUser, "conv-1", "Hello");

      expect(result.generatedTitle).toBeNull();
      expect(getConversationByIdMock).not.toHaveBeenCalled();
    });

    it("returns null and does not throw when title generation fails", async () => {
      setupDefaultMocks();
      getConversationByIdMock.mockRejectedValue(new Error("DB error"));

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      const result = await sendMessageAndGetResponse(testUser, "conv-1", "Hello");

      // Should not throw, generatedTitle should be null
      expect(result.generatedTitle).toBeNull();
      expect(result.assistantMessage).toBeDefined();
    });

    it("strips quotes and trims generated title", async () => {
      const fakeLlmModel = {
        invoke: vi.fn().mockResolvedValue({ content: '  "Hello World Chat"  ' }),
      };
      setupDefaultMocks();
      initLlmWithSettingsMock.mockResolvedValue({
        model: fakeLlmModel,
        provider: "gemini",
        overrides: {},
      });

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      const result = await sendMessageAndGetResponse(testUser, "conv-1", "Hello");

      expect(result.generatedTitle).toBe("Hello World Chat");
    });

    it("strips Japanese quotes from generated title", async () => {
      const fakeLlmModel = {
        invoke: vi.fn().mockResolvedValue({ content: "「日本語タイトル」" }),
      };
      setupDefaultMocks();
      initLlmWithSettingsMock.mockResolvedValue({
        model: fakeLlmModel,
        provider: "gemini",
        overrides: {},
      });

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      const result = await sendMessageAndGetResponse(testUser, "conv-1", "こんにちは");

      expect(result.generatedTitle).toBe("日本語タイトル");
    });
  });
});
