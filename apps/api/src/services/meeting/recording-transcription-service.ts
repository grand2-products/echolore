import { HumanMessage } from "@langchain/core/messages";
import type { LlmOverrides } from "../../ai/llm/index.js";
import {
  createChatModel,
  isTextGenerationEnabled,
  resolveTextProvider,
} from "../../ai/llm/index.js";
import { loadFile } from "../../lib/file-storage.js";
import { createTranscript } from "../../repositories/meeting/meeting-repository.js";
import { getLlmSettings } from "../admin/admin-service.js";

/**
 * Transcribe a completed recording using the configured LLM provider.
 *
 * Flow:
 * 1. Load recording file from storage
 * 2. Send audio to Gemini for transcription
 * 3. Parse the response into transcript segments
 * 4. Store each segment in the `transcripts` table
 *
 * The transcripts are stored with `speakerId = null` and a special marker
 * so the summary pipeline can distinguish STT-derived transcripts from
 * realtime ones.
 */
export async function transcribeRecording(
  meetingId: string,
  storagePath: string
): Promise<{ segmentCount: number }> {
  // Guard against path traversal — storagePath comes from DB but validate anyway
  if (!storagePath || storagePath.includes("..")) {
    console.error("[recording-transcription] Rejected unsafe storage path:", storagePath);
    return { segmentCount: 0 };
  }

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
    console.warn("[recording-transcription] LLM not configured, skipping transcription");
    return { segmentCount: 0 };
  }

  // Load audio file
  const audioBuffer = await loadFile(storagePath);
  const base64Audio = Buffer.from(audioBuffer).toString("base64");

  const prompt = [
    "You are a precise speech-to-text transcription assistant.",
    "Transcribe the following audio recording into text.",
    "Output each speaker turn on a new line in the format:",
    "  [MM:SS] Speaker N: <text>",
    "",
    "If you cannot distinguish speakers, use 'Speaker 1' for all.",
    "Include timestamps at the start of each segment.",
    "Output ONLY the transcription, no commentary.",
  ].join("\n");

  try {
    const model = createChatModel({ provider, temperature: 0, overrides });
    const response = await model.invoke([
      new HumanMessage({
        content: [
          { type: "text", text: prompt },
          {
            type: "media",
            mimeType: "video/mp4",
            data: base64Audio,
          },
        ],
      }),
    ]);

    const text =
      typeof response.content === "string"
        ? response.content.trim()
        : String(response.content).trim();

    if (!text) {
      console.warn("[recording-transcription] Empty transcription result");
      return { segmentCount: 0 };
    }

    // Parse transcription lines
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    const segments: Array<{ timestamp: string; speaker: string; content: string }> = [];

    for (const line of lines) {
      const match = line.match(/^\[(\d{1,2}:\d{2})\]\s*(.+?):\s*(.+)$/);
      if (match) {
        segments.push({
          timestamp: match[1] ?? "00:00",
          speaker: match[2]?.trim() ?? "Speaker 1",
          content: match[3]?.trim() ?? "",
        });
      } else {
        // Fallback: line without expected format
        segments.push({
          timestamp: "00:00",
          speaker: "Speaker 1",
          content: line.trim(),
        });
      }
    }

    // Store in transcripts table
    const baseTime = new Date();
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) continue;
      const [min, sec] = seg.timestamp.split(":").map(Number);
      const offsetMs = ((min ?? 0) * 60 + (sec ?? 0)) * 1000;

      await createTranscript({
        id: crypto.randomUUID(),
        meetingId,
        speakerId: null,
        content: `[${seg.speaker}] ${seg.content}`,
        timestamp: new Date(baseTime.getTime() + offsetMs),
        createdAt: new Date(),
      });
    }

    console.log(
      `[recording-transcription] Transcribed ${segments.length} segments for meeting ${meetingId}`
    );
    return { segmentCount: segments.length };
  } catch (error) {
    console.error("[recording-transcription] Transcription failed:", error);
    return { segmentCount: 0 };
  }
}

/**
 * Check if a meeting has a completed recording and trigger transcription if needed.
 * Called after egress_ended webhook.
 */
export async function maybeTranscribeCompletedRecording(meetingId: string): Promise<void> {
  // Import here to avoid circular dependency
  const { getRecordingStatus } = await import("./recording-service.js");
  const recordings = await getRecordingStatus(meetingId);
  const completed = recordings.find((r) => r.status === "completed" && r.storagePath);

  if (!completed?.storagePath) {
    return;
  }

  await transcribeRecording(meetingId, completed.storagePath);
}
