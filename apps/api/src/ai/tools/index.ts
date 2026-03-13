import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { SessionUser } from "../../lib/auth.js";
import { createMeetingTranscriptTool } from "./meeting-transcript-tool.js";
import { createUserLookupTool } from "./user-lookup-tool.js";
import { createWikiSearchTool } from "./wiki-search-tool.js";

export interface AgentToolContext {
  meetingId: string;
  user: SessionUser;
}

export function createAgentTools(context: AgentToolContext): DynamicStructuredTool[] {
  return [
    createWikiSearchTool(context.user),
    createMeetingTranscriptTool(context.meetingId),
    createUserLookupTool(),
  ];
}
