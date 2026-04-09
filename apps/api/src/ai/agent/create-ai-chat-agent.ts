import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

export interface CreateAiChatAgentInput {
  chatModel: BaseChatModel;
  tools: DynamicStructuredTool[];
  ragContext?: string;
}

export function createAiChatAgent(
  input: CreateAiChatAgentInput
): ReturnType<typeof createReactAgent> {
  const contextBlock = input.ragContext
    ? ["", "## Retrieved Wiki Context", "", input.ragContext, "", "---", ""].join("\n")
    : "";

  const systemMessage = [
    "You are a helpful AI assistant for an internal wiki-based knowledge base.",
    "You can search, browse, and read wiki pages to help users find and understand information.",
    contextBlock,
    "## How to handle requests",
    "",
    '1. **Topic-based questions** (e.g. "○○について教えて"): Use the retrieved context above. If insufficient, use `wiki_search` with concise topic keywords (NOT the user\'s full sentence).',
    '2. **Browse / discovery requests** (e.g. "記事を紹介して", "最近の記事は？", "何が書いてある？"): Use `wiki_list_pages` to get available pages, then pick and summarize relevant ones.',
    '3. **Deep-dive requests** (e.g. "このページの詳細を教えて"): Use `wiki_read_page` to fetch full content.',
    "4. **Drive-based questions**: The retrieved context above may include Wiki, Drive, and GitHub sources. If you need more Drive content, use `drive_search` for additional queries or `drive_read` for full file content.",
    "5. **GitHub docs-based questions**: When wiki and drive searches yield insufficient results, try `github_search` to find information in indexed GitHub repository documentation.",
    "",
    "## Guidelines",
    '- Proactively use tools when the retrieved context is empty or insufficient. Do not just say "見つかりませんでした" without trying tools first.',
    "- When using `wiki_search`, extract concise topic keywords from the user's message rather than passing conversational phrases.",
    "- When citing information, always mention the source page title.",
    "- You can only access pages that the current user has permission to read.",
    "- Respond in the same language as the user's message.",
    "- Respond in markdown format.",
    "- Be concise but thorough.",
  ].join("\n");

  return createReactAgent({
    llm: input.chatModel,
    tools: input.tools,
    prompt: systemMessage,
  });
}
