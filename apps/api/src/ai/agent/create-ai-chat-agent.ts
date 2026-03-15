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
    contextBlock,
    "Guidelines:",
    "- Answer questions primarily using the retrieved Wiki context above.",
    "- If the context does not contain enough information, honestly tell the user.",
    "- If you need additional information beyond the context, use the available tools to search or read pages.",
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
