import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { escapeXmlTags } from "../sanitize-prompt-input.js";

export interface CreateMeetingAgentInput {
  agentName: string;
  systemPrompt: string;
  interventionStyle: string;
  chatModel: BaseChatModel;
  tools: DynamicStructuredTool[];
}

export function createMeetingAgent(
  input: CreateMeetingAgentInput
): ReturnType<typeof createReactAgent> {
  const systemMessage = [
    `You are ${escapeXmlTags(input.agentName)}, an internal AI employee participating in a meeting.`,
    `Intervention style: ${escapeXmlTags(input.interventionStyle)}`,
    // systemPrompt is admin-controlled agent configuration — not user input, no escaping needed
    input.systemPrompt,
    "",
    "Use the available tools to look up information when needed.",
    "Respond in concise markdown suitable for in-meeting use.",
  ].join("\n");

  return createReactAgent({
    llm: input.chatModel,
    tools: input.tools,
    prompt: systemMessage,
  });
}
