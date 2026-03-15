import { UserRole } from "@echolore/shared/contracts";
import { HumanMessage } from "@langchain/core/messages";
import { createMeetingAgent } from "../../ai/agent/create-meeting-agent.js";
import { createSpeechGatewayBundle } from "../../ai/gateway/index.js";
import type { LlmOverrides } from "../../ai/llm/index.js";
import {
  createChatModel,
  isTextGenerationEnabled,
  resolveTextProvider,
} from "../../ai/llm/index.js";
import { createAgentTools } from "../../ai/tools/index.js";
import type { SessionUser } from "../../lib/auth.js";
import {
  createMeetingAgentEvent,
  getActiveMeetingAgentSession,
  getAgentById,
  listFinalTranscriptSegmentsByMeeting,
} from "../../repositories/meeting/meeting-realtime-repository.js";
import { getUserById } from "../../repositories/user/user-repository.js";
import { getLlmSettings } from "../admin/admin-service.js";

function buildFallbackResponse(agentName: string, prompt: string, transcriptLines: string[]) {
  return [
    `${agentName} response`,
    "",
    `Prompt: ${prompt}`,
    "",
    "Recent context:",
    transcriptLines
      .slice(-5)
      .map((line) => `- ${line}`)
      .join("\n") || "- No recent transcript",
    "",
    "Suggested next action:",
    "- Clarify the owner, deadline, or decision before proceeding.",
  ].join("\n");
}

async function generateAgentTextResponse(input: {
  meetingId: string;
  agentName: string;
  systemPrompt: string;
  interventionStyle: string;
  prompt: string;
  transcriptLines: string[];
  defaultProvider?: string;
  triggeredByUserId: string;
}) {
  const dbSettings = await getLlmSettings();
  const overrides: LlmOverrides = {
    geminiApiKey: dbSettings.geminiApiKey,
    geminiTextModel: dbSettings.geminiTextModel,
    vertexProject: dbSettings.vertexProject,
    vertexLocation: dbSettings.vertexLocation,
    vertexModel: dbSettings.vertexModel,
    zhipuApiKey: dbSettings.zhipuApiKey,
    zhipuTextModel: dbSettings.zhipuTextModel,
    zhipuUseCodingPlan: dbSettings.zhipuUseCodingPlan,
  };
  const provider = resolveTextProvider(input.defaultProvider ?? dbSettings.provider);
  if (!isTextGenerationEnabled(provider, overrides)) {
    return buildFallbackResponse(input.agentName, input.prompt, input.transcriptLines);
  }

  try {
    const chatModel = createChatModel({ provider, temperature: 0.4, overrides });

    const triggerUser = await getUserById(input.triggeredByUserId);
    const user: SessionUser = triggerUser
      ? {
          id: triggerUser.id,
          email: triggerUser.email,
          name: triggerUser.name,
          role: triggerUser.role as UserRole,
          avatarUrl: triggerUser.avatarUrl,
        }
      : {
          id: input.triggeredByUserId,
          email: "unknown@corp.internal",
          name: "Unknown User",
          role: UserRole.Member,
        };

    const tools = createAgentTools({
      meetingId: input.meetingId,
      user,
    });

    const executor = createMeetingAgent({
      agentName: input.agentName,
      systemPrompt: input.systemPrompt,
      interventionStyle: input.interventionStyle,
      chatModel,
      tools,
    });

    const contextBlock =
      input.transcriptLines.length > 0
        ? `\n\nRecent transcript:\n${input.transcriptLines.join("\n")}`
        : "";

    const result = await executor.invoke({
      messages: [new HumanMessage(`${input.prompt}${contextBlock}`)],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const text = typeof lastMessage?.content === "string" ? lastMessage.content.trim() : "";
    return text || buildFallbackResponse(input.agentName, input.prompt, input.transcriptLines);
  } catch {
    return buildFallbackResponse(input.agentName, input.prompt, input.transcriptLines);
  }
}

export async function generateMeetingAgentResponse(input: {
  meetingId: string;
  agentId: string;
  prompt: string;
  triggeredByUserId: string;
  languageCode?: string;
  triggerMode?: "manual" | "autonomous";
}) {
  const [agent, session, transcriptSegments] = await Promise.all([
    getAgentById(input.agentId),
    getActiveMeetingAgentSession(input.meetingId, input.agentId),
    listFinalTranscriptSegmentsByMeeting(input.meetingId),
  ]);

  if (!agent || !agent.isActive || !session) {
    return null;
  }

  const transcriptLines = [...transcriptSegments]
    .reverse()
    .map((segment) => `${segment.speakerLabel}: ${segment.content}`);
  const responseText = await generateAgentTextResponse({
    meetingId: input.meetingId,
    agentName: agent.name,
    systemPrompt: agent.systemPrompt,
    interventionStyle: agent.interventionStyle,
    prompt: input.prompt,
    transcriptLines,
    defaultProvider: agent.defaultProvider,
    triggeredByUserId: input.triggeredByUserId,
  });

  // Skip TTS for autonomous interventions (text-only, displayed in timeline)
  let audio: { mimeType: string; base64: string } | null = null;
  if (input.triggerMode !== "autonomous") {
    try {
      const speechProvider = agent.defaultProvider === "zhipu" ? "google" : agent.defaultProvider;
      const gateways = createSpeechGatewayBundle(speechProvider);
      const synthesized = await gateways.tts.synthesize({
        text: responseText,
        languageCode: input.languageCode ?? "ja-JP",
        voice: agent.voiceProfile ?? undefined,
      });
      audio = {
        mimeType: synthesized.mimeType,
        base64: synthesized.audio.toString("base64"),
      };
    } catch {
      audio = null;
    }
  }

  const eventType =
    input.triggerMode === "autonomous" ? "response.autonomous" : "response.generated";

  await createMeetingAgentEvent({
    id: crypto.randomUUID(),
    meetingId: input.meetingId,
    agentId: input.agentId,
    eventType,
    payload: {
      sessionId: session.id,
      prompt: input.prompt,
      responseText,
      audioAvailable: Boolean(audio),
      triggerMode: input.triggerMode ?? "manual",
    },
    triggeredByUserId: input.triggeredByUserId,
    createdAt: new Date(),
  });

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      voiceProfile: agent.voiceProfile,
      provider: agent.defaultProvider,
    },
    sessionId: session.id,
    responseText,
    audio,
  };
}
