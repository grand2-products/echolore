import { UserRole } from "@echolore/shared/contracts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SessionUser } from "../../lib/auth.js";
import { listFinalTranscriptSegmentsByMeeting } from "../../repositories/meeting/meeting-realtime-repository.js";
import {
  getMeetingById,
  listMeetingsByUser,
} from "../../repositories/meeting/meeting-repository.js";
import { escapeXmlTags } from "../sanitize-prompt-input.js";

/**
 * Viewer-scoped meeting tools for the AITuber agent (#73).
 *
 * ## Permission boundary
 * AITuber responses are broadcast to **every viewer** over the LiveKit data
 * channel, so these tools must never surface a meeting the asking viewer can't
 * already see. We scope strictly to meetings the viewer **owns** (creator) —
 * plus admins, who can read any meeting. This mirrors `listMeetingsByUser`
 * (creator-based) and the meeting detail `read` authorization, and deliberately
 * does NOT include meetings where the viewer was merely a participant: that
 * boundary is fuzzier and a transcript leak here is amplified by broadcast.
 */

function canViewerAccessMeeting(viewer: SessionUser, meeting: { creatorId: string }): boolean {
  return viewer.role === UserRole.Admin || meeting.creatorId === viewer.id;
}

/**
 * `lookup_recent_meetings` — list the viewer's own recent meetings so the agent
 * can answer "what meetings did I have recently?" and obtain a meetingId to feed
 * into `lookup_meeting_transcript`.
 */
export function createRecentMeetingsTool(viewer: SessionUser) {
  return new DynamicStructuredTool({
    name: "lookup_recent_meetings",
    description:
      "List the current viewer's own recent meetings (id, title, status, date). " +
      "Use this to discover a meetingId before calling lookup_meeting_transcript, " +
      "or to answer questions about the viewer's recent meetings.",
    schema: z.object({
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(10)
        .describe("Maximum number of meetings to return (default 10)"),
    }),
    func: async ({ limit }) => {
      // Admins still only see *their own* meetings here — listing every
      // meeting in the org via a broadcast surface would be inappropriate.
      // Transcript access for arbitrary meetings is handled (with an admin
      // override) in lookup_meeting_transcript.
      const meetings = await listMeetingsByUser(viewer.id, { limit });
      if (meetings.length === 0) {
        return "You have no recent meetings.";
      }
      return meetings
        .map((m) => {
          const date = new Date(m.createdAt).toISOString().slice(0, 10);
          return `- [${escapeXmlTags(m.title)}] (id: ${m.id}, status: ${m.status}, date: ${date})`;
        })
        .join("\n");
    },
  });
}

/**
 * `lookup_meeting_transcript` — return finalized transcript segments for a
 * meeting the viewer is allowed to read. Permission is enforced per call.
 */
export function createMeetingTranscriptLookupTool(viewer: SessionUser) {
  return new DynamicStructuredTool({
    name: "lookup_meeting_transcript",
    description:
      "Read the finalized transcript of one of the viewer's meetings by its ID. " +
      "Use lookup_recent_meetings first to obtain a valid meetingId. " +
      "Only meetings the viewer can access are readable.",
    schema: z.object({
      meetingId: z.string().describe("The meeting ID to read the transcript for"),
    }),
    func: async ({ meetingId }) => {
      const meeting = await getMeetingById(meetingId);
      if (!meeting) {
        return "Meeting not found.";
      }
      if (!canViewerAccessMeeting(viewer, meeting)) {
        return "You do not have permission to read this meeting's transcript.";
      }
      const segments = await listFinalTranscriptSegmentsByMeeting(meetingId, 50);
      if (segments.length === 0) {
        return `No transcript is available for "${escapeXmlTags(meeting.title)}".`;
      }
      const body = segments
        .map((s) => `[${escapeXmlTags(s.speakerLabel)}] ${escapeXmlTags(s.content)}`)
        .join("\n");
      return `# ${escapeXmlTags(meeting.title)}\n\n${body}`;
    },
  });
}
