import { nanoid } from "nanoid";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { SessionUser } from "../../lib/auth.js";
import { createChatModel, isTextGenerationEnabled, resolveTextProvider } from "../../ai/llm/index.js";
import { createWikiChatAgent } from "../../ai/agent/create-wiki-chat-agent.js";
import {
  createWikiChatSearchTool,
  createWikiChatReadPageTool,
  type WikiChatToolResult,
} from "../../ai/tools/wiki-chat-tools.js";
import {
  createMessage,
  getRecentMessages,
  updateConversation,
} from "../../repositories/wiki-chat/wiki-chat-repository.js";
import { getLlmSettings } from "../admin/admin-service.js";
import { searchVisibleChunks, type VectorSearchResult } from "../wiki/vector-search-service.js";

export async function sendMessageAndGetResponse(
  user: SessionUser,
  conversationId: string,
  content: string
) {
  // Save user message
  const userMessage = await createMessage({
    id: nanoid(),
    conversationId,
    role: "user",
    content,
    citations: null,
    createdAt: new Date(),
  });

  if (!userMessage) {
    throw new Error("Failed to create user message");
  }

  // Load conversation history and build LangChain messages
  const recentMessages = await getRecentMessages(conversationId, 20);
  const messageHistory = recentMessages
    .filter((m) => m.id !== userMessage.id)
    .map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
    );
  messageHistory.push(new HumanMessage(content));

  // Run RAG + Agent
  const { responseContent, citations } = await invokeAgent(user, content, messageHistory, conversationId);

  // Save assistant message
  const assistantMessage = await createMessage({
    id: nanoid(),
    conversationId,
    role: "assistant",
    content: responseContent,
    citations: citations.length > 0 ? citations : null,
    createdAt: new Date(),
  });

  // Update conversation timestamp
  await updateConversation(conversationId, { updatedAt: new Date() });

  return { userMessage, assistantMessage };
}

async function invokeAgent(
  user: SessionUser,
  userQuery: string,
  messageHistory: (HumanMessage | AIMessage)[],
  conversationId: string
): Promise<{ responseContent: string; citations: WikiChatToolResult[] }> {
  const llmSettings = await getLlmSettings();
  const provider = resolveTextProvider(llmSettings.provider ?? undefined);

  if (!isTextGenerationEnabled(provider, llmSettings)) {
    return {
      responseContent:
        "I'm sorry, but the AI service is currently unavailable. Please try again later.",
      citations: [],
    };
  }

  // Step 1: Deterministic RAG — always perform vector search
  const searchStart = Date.now();
  let ragResults: VectorSearchResult[] = [];
  try {
    ragResults = await searchVisibleChunks(user, userQuery, 5);
  } catch (err) {
    console.error(JSON.stringify({
      event: "wiki-chat.search.error",
      query: userQuery.slice(0, 100),
      error: err instanceof Error ? err.message : "Unknown",
    }));
  }
  const searchDurationMs = Date.now() - searchStart;

  console.log(JSON.stringify({
    event: "wiki-chat.search",
    query: userQuery.slice(0, 100),
    resultCount: ragResults.length,
    topSimilarity: ragResults[0]?.similarity ?? 0,
    durationMs: searchDurationMs,
  }));

  // Step 2: Build RAG context string
  const ragContext = ragResults.length > 0
    ? ragResults
        .map(
          (r, i) =>
            `### Source ${i + 1}: ${r.pageTitle} (id: ${r.pageId})\n${r.chunkText}`
        )
        .join("\n\n")
    : "No relevant wiki content was found for this query.";

  // Step 3: RAG citations from search
  const ragCitations: WikiChatToolResult[] = ragResults.map((r) => ({
    pageId: r.pageId,
    pageTitle: r.pageTitle,
    snippet: r.chunkText.slice(0, 200),
  }));

  // Step 4: Create tools for additional agent exploration
  const { searchTool, referencedPages: searchRefs } = createWikiChatSearchTool(user);
  const { readPageTool, referencedPages: readRefs } = createWikiChatReadPageTool(user);

  try {
    const generateStart = Date.now();

    const chatModel = createChatModel({
      provider,
      temperature: 0.3,
      maxTokens: 2048,
      overrides: llmSettings,
    });

    const agent = createWikiChatAgent({
      chatModel,
      tools: [searchTool, readPageTool],
      ragContext,
    });

    const result = await agent.invoke({ messages: messageHistory });

    // Extract the last AI message
    const aiMessages = result.messages.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => m._getType?.() === "ai" || m.constructor?.name === "AIMessage"
    );

    let responseContent = "";
    if (aiMessages.length > 0) {
      const lastAiMessage = aiMessages[aiMessages.length - 1];
      responseContent =
        typeof lastAiMessage.content === "string"
          ? lastAiMessage.content
          : JSON.stringify(lastAiMessage.content);
    }

    const generateDurationMs = Date.now() - generateStart;

    // Deduplicate citations: RAG results + tool-referenced pages
    const seenPageIds = new Set<string>();
    const citations = [...ragCitations, ...searchRefs, ...readRefs].filter((ref) => {
      if (seenPageIds.has(ref.pageId)) return false;
      seenPageIds.add(ref.pageId);
      return true;
    });

    console.log(JSON.stringify({
      event: "wiki-chat.generate",
      conversationId,
      contextPages: citations.map((c) => c.pageId),
      durationMs: generateDurationMs,
    }));

    return { responseContent, citations };
  } catch (error) {
    console.error(JSON.stringify({
      event: "wiki-chat.error",
      conversationId,
      error: error instanceof Error ? error.message : "Unknown",
    }));
    return {
      responseContent:
        "An error occurred while processing your request. Please try again.",
      citations: ragCitations,
    };
  }
}
