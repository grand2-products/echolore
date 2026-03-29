import { HumanMessage } from "@langchain/core/messages";
import type { Transcript } from "../db/schema.js";
import { initLlmWithSettings } from "./llm/index.js";

const clip = (value: string, max = 12000) => value.slice(0, max);

function fallbackSummary(
  transcripts: Array<Pick<Transcript, "speaker_id" | "content" | "timestamp">>
) {
  const firstLines = transcripts
    .slice(0, 8)
    .map((t) => `- ${t.speaker_id ?? "speaker"}: ${t.content}`)
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
  transcripts: Array<Pick<Transcript, "speaker_id" | "content" | "timestamp">>
): Promise<string> {
  const result = await initLlmWithSettings({ temperature: 0.2 });

  if (!result) {
    return fallbackSummary(transcripts);
  }

  const transcriptText = clip(
    transcripts
      .map((t) => {
        const at = t.timestamp instanceof Date ? t.timestamp.toISOString() : String(t.timestamp);
        return `[${at}] ${t.speaker_id ?? "speaker"}: ${t.content}`;
      })
      .join("\n")
  );

  const prompt = [
    "You are an assistant creating concise internal meeting minutes.",
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
    const model = result.model;
    const response = await model.invoke([new HumanMessage(prompt)]);
    const text =
      typeof response.content === "string"
        ? response.content.trim()
        : String(response.content).trim();
    if (!text) return fallbackSummary(transcripts);
    return text;
  } catch {
    return fallbackSummary(transcripts);
  }
}
