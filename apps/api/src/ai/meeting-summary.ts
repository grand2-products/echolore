import { HumanMessage } from "@langchain/core/messages";
import type { Transcript } from "../db/schema.js";
import { getLlmSettings } from "../services/admin/admin-service.js";
import { createChatModel, isTextGenerationEnabled, resolveTextProvider } from "./llm/index.js";
import type { LlmOverrides } from "./llm/index.js";

const clip = (value: string, max = 12000) => value.slice(0, max);

function fallbackSummary(transcripts: Array<Pick<Transcript, "speakerId" | "content" | "timestamp">>) {
  const firstLines = transcripts
    .slice(0, 8)
    .map((t) => `- ${t.speakerId ?? "speaker"}: ${t.content}`)
    .join("\n");

  return [
    "## Meeting Summary",
    "",
    "### Highlights",
    firstLines || "- (no transcript snippets)",
    "",
    "### Action Items",
    "- Confirm decisions and owners.",
    "- Follow up open discussion points.",
  ].join("\n");
}

export async function generateMeetingSummary(
  meetingTitle: string,
  transcripts: Array<Pick<Transcript, "speakerId" | "content" | "timestamp">>,
): Promise<string> {
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
  const provider = resolveTextProvider(dbSettings.provider);

  if (!isTextGenerationEnabled(provider, overrides)) {
    return fallbackSummary(transcripts);
  }

  const transcriptText = clip(
    transcripts
      .map((t) => {
        const at = t.timestamp instanceof Date ? t.timestamp.toISOString() : String(t.timestamp);
        return `[${at}] ${t.speakerId ?? "speaker"}: ${t.content}`;
      })
      .join("\n"),
  );

  const prompt = [
    `You are an assistant creating concise internal meeting minutes.`,
    `Meeting title: ${meetingTitle}`,
    "",
    "Please output markdown with these sections:",
    "## Meeting Summary",
    "### Highlights (3-7 bullet points)",
    "### Decisions (bullet points, or 'None')",
    "### Action Items (owner + due if available)",
    "",
    "Transcript:",
    transcriptText,
  ].join("\n");

  try {
    const model = createChatModel({ provider, temperature: 0.2, overrides });
    const response = await model.invoke([new HumanMessage(prompt)]);
    const text = typeof response.content === "string"
      ? response.content.trim()
      : String(response.content).trim();
    if (!text) return fallbackSummary(transcripts);
    return text;
  } catch {
    return fallbackSummary(transcripts);
  }
}
