import type { Transcript } from "../db/schema.js";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";

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
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-1.5-flash";

  if (!apiKey) {
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
    const response = await fetch(
      `${GEMINI_API_URL}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      },
    );

    if (!response.ok) {
      return fallbackSummary(transcripts);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return fallbackSummary(transcripts);
    return text;
  } catch {
    return fallbackSummary(transcripts);
  }
}
