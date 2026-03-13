import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { Runnable } from "@langchain/core/runnables";

export interface CreateMeetingAgentInput {
  agentName: string;
  systemPrompt: string;
  interventionStyle: string;
  chatModel: BaseChatModel;
  tools: DynamicStructuredTool[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMeetingAgent(input: CreateMeetingAgentInput): Runnable<any, any> {
  const systemMessage = [
    `You are ${input.agentName}, an internal AI employee participating in a meeting.`,
    `Intervention style: ${input.interventionStyle}`,
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
