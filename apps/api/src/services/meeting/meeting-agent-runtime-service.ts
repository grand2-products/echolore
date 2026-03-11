import { createSpeechGatewayBundle } from "../../ai/gateway/index.js";
import {
  createMeetingAgentEvent,
  getActiveMeetingAgentSession,
  getAgentById,
  listFinalTranscriptSegmentsByMeeting,
} from "../../repositories/meeting/meeting-realtime-repository.js";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";

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
  agentName: string;
  systemPrompt: string;
  interventionStyle: string;
  prompt: string;
  transcriptLines: string[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-1.5-flash";
  if (!apiKey) {
    return buildFallbackResponse(input.agentName, input.prompt, input.transcriptLines);
  }

  const prompt = [
    `You are ${input.agentName}, an internal AI employee participating in a meeting.`,
    `Intervention style: ${input.interventionStyle}`,
    `System prompt: ${input.systemPrompt}`,
    "",
    `User request: ${input.prompt}`,
    "",
    "Recent transcript:",
    input.transcriptLines.join("\n") || "(no transcript)",
    "",
    "Respond in concise markdown suitable for in-meeting use.",
  ].join("\n");

  try {
    const response = await fetch(
      `${GEMINI_API_URL}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
          },
        }),
      }
    );

    if (!response.ok) {
      return buildFallbackResponse(input.agentName, input.prompt, input.transcriptLines);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ??
      buildFallbackResponse(input.agentName, input.prompt, input.transcriptLines)
    );
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
    agentName: agent.name,
    systemPrompt: agent.systemPrompt,
    interventionStyle: agent.interventionStyle,
    prompt: input.prompt,
    transcriptLines,
  });

  let audio: { mimeType: string; base64: string } | null = null;
  try {
    const gateways = createSpeechGatewayBundle(agent.defaultProvider);
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

  await createMeetingAgentEvent({
    id: crypto.randomUUID(),
    meetingId: input.meetingId,
    agentId: input.agentId,
    eventType: "response.generated",
    payload: {
      sessionId: session.id,
      prompt: input.prompt,
      responseText,
      audioAvailable: Boolean(audio),
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
