import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  type ToolMessage,
} from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { nanoid } from "nanoid";
import { createAiChatAgent } from "../../ai/agent/create-ai-chat-agent.js";
import { defaultLlmProvider, type LlmProvider } from "../../ai/providers/index.js";
import { escapeXmlTags } from "../../ai/sanitize-prompt-input.js";
import {
  createAiChatDriveReadTool,
  createAiChatDriveSearchTool,
  type DriveToolResult,
} from "../../ai/tools/ai-chat-drive-tools.js";
import {
  type AiChatToolResult,
  createAiChatListPagesTool,
  createAiChatReadPageTool,
  createAiChatSearchTool,
} from "../../ai/tools/ai-chat-tools.js";
import type { ToolStepJson } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import {
  createMessage,
  listRecentMessages,
  updateConversation,
} from "../../repositories/ai-chat/ai-chat-repository.js";
import { getResolvedDriveSettings } from "../admin/drive-settings-service.js";
import {
  type SearchMode,
  searchVisibleChunks,
  type VectorSearchResult,
  type VisibleChunksResult,
} from "../wiki/vector-search-service.js";

// Replaceable for testing
let llm: LlmProvider = defaultLlmProvider;

/** @internal Override LLM provider (test-only) */
export function _setLlmProvider(p: LlmProvider) {
  llm = p;
}

export async function sendMessageAndGetResponse(
  user: SessionUser,
  conversationId: string,
  content: string
) {
  // Save user message
  const userMessage = await createMessage({
    id: nanoid(),
    conversationId: conversationId,
    role: "user",
    content,
    citations: null,
    createdAt: new Date(),
  });

  if (!userMessage) {
    throw new Error("Failed to create user message");
  }

  // Load conversation history and build LangChain messages
  const recentMessages = await listRecentMessages(conversationId, 20);
  const messageHistory = recentMessages
    .filter((m) => m.id !== userMessage.id)
    .map((m) =>
      m.role === "user" ? new HumanMessage(escapeXmlTags(m.content)) : new AIMessage(m.content)
    );
  messageHistory.push(new HumanMessage(escapeXmlTags(content)));

  // Run RAG + Agent
  const { responseContent, citations, toolSteps } = await invokeAgent(
    user,
    content,
    messageHistory,
    conversationId
  );

  // Save assistant message
  const assistantMessage = await createMessage({
    id: nanoid(),
    conversationId: conversationId,
    role: "assistant",
    content: responseContent,
    citations: citations.length > 0 ? citations : null,
    toolSteps: toolSteps.length > 0 ? toolSteps : null,
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
): Promise<{ responseContent: string; citations: AiChatToolResult[]; toolSteps: ToolStepJson[] }> {
  const llmResult = await llm.init({ temperature: 0.3, maxTokens: 2048 });

  if (!llmResult) {
    return {
      responseContent:
        "I'm sorry, but the AI service is currently unavailable. Please try again later.",
      citations: [],
      toolSteps: [],
    };
  }

  // Step 1: Deterministic RAG — always perform vector search
  const searchStart = Date.now();
  let ragResults: VectorSearchResult[] = [];
  let searchMode: SearchMode = "vector";
  try {
    const searchResult: VisibleChunksResult = await searchVisibleChunks(user, userQuery, 5);
    ragResults = searchResult.results;
    searchMode = searchResult.searchMode;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "ai-chat.search.error",
        query: userQuery.slice(0, 100),
        error: err instanceof Error ? err.message : "Unknown",
      })
    );
  }
  const searchDurationMs = Date.now() - searchStart;

  console.log(
    JSON.stringify({
      event: "ai-chat.search",
      query: userQuery.slice(0, 100),
      searchMode,
      resultCount: ragResults.length,
      topSimilarity: ragResults[0]?.similarity ?? 0,
      durationMs: searchDurationMs,
    })
  );

  // Step 2: Build RAG context string (sanitize wiki content to prevent prompt injection)
  const ragContext =
    ragResults.length > 0
      ? ragResults
          .map(
            (r, i) =>
              `### Source ${i + 1}: ${escapeXmlTags(r.pageTitle)} (id: ${r.pageId})\n${escapeXmlTags(r.chunkText)}`
          )
          .join("\n\n")
      : "No relevant wiki content was found for this query.";

  // Step 3: RAG citations from search
  const ragCitations: AiChatToolResult[] = ragResults.map((r) => ({
    pageId: r.pageId,
    pageTitle: r.pageTitle,
    snippet: r.chunkText.slice(0, 200),
  }));

  // Step 4: Create tools for additional agent exploration
  const { searchTool, referencedPages: searchRefs } = createAiChatSearchTool(user);
  const { listPagesTool, referencedPages: listRefs } = createAiChatListPagesTool(user);
  const { readPageTool, referencedPages: readRefs } = createAiChatReadPageTool(user);

  // Step 4b: Conditionally add Drive tools
  let driveSearchRefs: DriveToolResult[] = [];
  let driveReadRefs: DriveToolResult[] = [];
  const allTools: DynamicStructuredTool[] = [searchTool, listPagesTool, readPageTool];

  try {
    const driveSettings = await getResolvedDriveSettings();
    if (driveSettings.enabled && driveSettings.sharedDriveIds.length > 0) {
      const { driveSearchTool, referencedFiles: searchFiles } = createAiChatDriveSearchTool(user);
      const { driveReadTool, referencedFiles: readFiles } = createAiChatDriveReadTool(user);
      allTools.push(driveSearchTool, driveReadTool);
      driveSearchRefs = searchFiles;
      driveReadRefs = readFiles;
    }
  } catch {
    // Drive not configured — continue without Drive tools
  }

  try {
    const generateStart = Date.now();

    const chatModel = llmResult.model;

    const agent = createAiChatAgent({
      chatModel,
      tools: allTools,
      ragContext,
    });

    const result = await agent.invoke({ messages: messageHistory });

    // Extract the last AI message
    const aiMessages = result.messages.filter(
      (m: BaseMessage) => m._getType?.() === "ai" || m.constructor?.name === "AIMessage"
    );

    let responseContent = "";
    const lastAiMessage = aiMessages.at(-1);
    if (lastAiMessage) {
      responseContent =
        typeof lastAiMessage.content === "string"
          ? lastAiMessage.content
          : JSON.stringify(lastAiMessage.content);
    }

    // Extract tool steps: pair each AI tool_call with its ToolMessage result
    const toolSteps: ToolStepJson[] = [];
    for (const msg of result.messages) {
      if (msg._getType?.() === "ai" || msg.constructor?.name === "AIMessage") {
        const aiMsg = msg as AIMessage;
        if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
          for (const tc of aiMsg.tool_calls) {
            const toolResponse = result.messages.find(
              (m: BaseMessage) =>
                (m._getType?.() === "tool" || m.constructor?.name === "ToolMessage") &&
                (m as ToolMessage).tool_call_id === tc.id
            );
            toolSteps.push({
              toolName: tc.name,
              toolArgs: tc.args as Record<string, unknown>,
              toolResult:
                typeof toolResponse?.content === "string"
                  ? toolResponse.content.slice(0, 500)
                  : JSON.stringify(toolResponse?.content ?? "").slice(0, 500),
            });
          }
        }
      }
    }

    const generateDurationMs = Date.now() - generateStart;

    // Deduplicate citations: RAG results + tool-referenced pages + Drive files
    const seenIds = new Set<string>();
    const wikiCitations: AiChatToolResult[] = [
      ...ragCitations,
      ...searchRefs,
      ...listRefs,
      ...readRefs,
    ].filter((ref) => {
      if (seenIds.has(ref.pageId)) return false;
      seenIds.add(ref.pageId);
      return true;
    });

    // Convert Drive refs to citation format
    const driveCitations: AiChatToolResult[] = [...driveSearchRefs, ...driveReadRefs]
      .filter((ref) => {
        const key = `drive:${ref.driveFileId}`;
        if (seenIds.has(key)) return false;
        seenIds.add(key);
        return true;
      })
      .map((ref) => ({
        pageId: ref.driveFileId,
        pageTitle: ref.driveFileName,
        snippet: ref.snippet,
        driveFileId: ref.driveFileId,
        driveFileName: ref.driveFileName,
        driveLink: ref.driveLink,
        source: "drive" as const,
      }));

    const citations = [
      ...wikiCitations.map((c) => ({ ...c, source: "wiki" as const })),
      ...driveCitations,
    ];

    console.log(
      JSON.stringify({
        event: "ai-chat.generate",
        conversationId,
        contextPages: citations.map((c) => c.pageId),
        durationMs: generateDurationMs,
      })
    );

    return { responseContent, citations, toolSteps };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "ai-chat.error",
        conversationId,
        error: error instanceof Error ? error.message : "Unknown",
      })
    );
    return {
      responseContent: "An error occurred while processing your request. Please try again.",
      citations: ragCitations,
      toolSteps: [],
    };
  }
}
