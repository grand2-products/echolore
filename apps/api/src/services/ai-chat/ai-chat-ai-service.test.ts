import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createMessageMock,
  listRecentMessagesMock,
  updateConversationMock,
  initLlmWithSettingsMock,
  searchVisibleChunksMock,
  createAiChatAgentMock,
  createAiChatSearchToolMock,
  createAiChatListPagesToolMock,
  createAiChatReadPageToolMock,
} = vi.hoisted(() => ({
  createMessageMock: vi.fn(),
  listRecentMessagesMock: vi.fn(),
  updateConversationMock: vi.fn(),
  initLlmWithSettingsMock: vi.fn(),
  searchVisibleChunksMock: vi.fn(),
  createAiChatAgentMock: vi.fn(),
  createAiChatSearchToolMock: vi.fn(),
  createAiChatListPagesToolMock: vi.fn(),
  createAiChatReadPageToolMock: vi.fn(),
}));

vi.mock("../../repositories/ai-chat/ai-chat-repository.js", () => ({
  createMessage: createMessageMock,
  listRecentMessages: listRecentMessagesMock,
  updateConversation: updateConversationMock,
}));

vi.mock("../wiki/vector-search-service.js", () => ({
  searchVisibleChunks: searchVisibleChunksMock,
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
    listRecentMessagesMock.mockReset();
    updateConversationMock.mockReset();
    initLlmWithSettingsMock.mockReset();
    searchVisibleChunksMock.mockReset();
    createAiChatAgentMock.mockReset();
    createAiChatSearchToolMock.mockReset();
    createAiChatListPagesToolMock.mockReset();
    createAiChatReadPageToolMock.mockReset();
  });

  function setupDefaultMocks() {
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
    listRecentMessagesMock.mockResolvedValue([]);
    updateConversationMock.mockResolvedValue({});
    initLlmWithSettingsMock.mockResolvedValue({
      model: {},
      provider: "gemini",
      overrides: {},
    });
    searchVisibleChunksMock.mockResolvedValue([]);
    createAiChatSearchToolMock.mockReturnValue({ searchTool: {}, referencedPages: [] });
    createAiChatListPagesToolMock.mockReturnValue({ listPagesTool: {}, referencedPages: [] });
    createAiChatReadPageToolMock.mockReturnValue({ readPageTool: {}, referencedPages: [] });

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
      initLlmWithSettingsMock.mockResolvedValue(null);

      const { sendMessageAndGetResponse } = await import("./ai-chat-ai-service.js");
      await sendMessageAndGetResponse(testUser, "conv-1", "Hello");

      // The assistant message should contain the unavailable text
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
      initLlmWithSettingsMock.mockResolvedValue({
        model: {},
        provider: "gemini",
        overrides: {},
      });
      searchVisibleChunksMock.mockResolvedValue([
        { pageId: "page-1", pageTitle: "Deploy Guide", chunkText: "Step 1: ...", similarity: 0.9 },
      ]);
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

      // The assistant message should include citations
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
      initLlmWithSettingsMock.mockResolvedValue({
        model: {},
        provider: "gemini",
        overrides: {},
      });
      searchVisibleChunksMock.mockResolvedValue([]);
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
});
