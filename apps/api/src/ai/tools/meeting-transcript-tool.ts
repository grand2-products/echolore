import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { listFinalTranscriptSegmentsByMeeting } from "../../repositories/meeting/meeting-realtime-repository.js";

export function createMeetingTranscriptTool(contextMeetingId: string) {
  return new DynamicStructuredTool({
    name: "get_meeting_transcript",
    description:
      "Retrieve recent finalized transcript segments from a meeting. Defaults to the current meeting.",
    schema: z.object({
      meetingId: z
        .string()
        .optional()
        .describe("Meeting ID to fetch transcript for. Defaults to the current meeting."),
    }),
    func: async ({ meetingId }) => {
      const id = meetingId || contextMeetingId;
      const segments = await listFinalTranscriptSegmentsByMeeting(id, 50);
      if (segments.length === 0) {
        return "No transcript segments found for this meeting.";
      }
      return segments
        .map((s) => `[${s.speakerLabel}]: ${s.content}`)
        .join("\n");
    },
  });
}
