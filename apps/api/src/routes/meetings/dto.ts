import type { MeetingDto, SummaryDto, TranscriptDto } from "@contracts/index";
import type { meetings, summaries, transcripts } from "../../db/schema.js";

export const toIso = (value: Date | null): string | null => (value ? value.toISOString() : null);

export const toMeetingDto = (meeting: typeof meetings.$inferSelect): MeetingDto => ({
  id: meeting.id,
  title: meeting.title,
  creatorId: meeting.creatorId,
  roomName: meeting.roomName,
  status: meeting.status as MeetingDto["status"],
  startedAt: toIso(meeting.startedAt),
  endedAt: toIso(meeting.endedAt),
  scheduledAt: toIso(meeting.scheduledAt),
  googleCalendarEventId: meeting.googleCalendarEventId,
  createdAt: meeting.createdAt.toISOString(),
});

export const toTranscriptDto = (transcript: typeof transcripts.$inferSelect): TranscriptDto => ({
  id: transcript.id,
  meetingId: transcript.meetingId,
  speakerId: transcript.speakerId,
  content: transcript.content,
  timestamp: transcript.timestamp.toISOString(),
  createdAt: transcript.createdAt.toISOString(),
});

export const toSummaryDto = (summary: typeof summaries.$inferSelect): SummaryDto => ({
  id: summary.id,
  meetingId: summary.meetingId,
  content: summary.content,
  createdAt: summary.createdAt.toISOString(),
});
