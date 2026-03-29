import type {
  MeetingDto,
  MeetingParticipantDto,
  RealtimeTranscriptSegmentDto,
  SummaryDto,
  TranscriptDto,
} from "@echolore/shared/contracts";
import type {
  Meeting,
  MeetingParticipant,
  MeetingTranscriptSegment,
  Summary,
  Transcript,
} from "../../db/schema.js";

export const toIso = (value: Date | null): string | null => (value ? value.toISOString() : null);

export const toMeetingDto = (meeting: Meeting): MeetingDto => ({
  id: meeting.id,
  title: meeting.title,
  creatorId: meeting.creator_id,
  roomName: meeting.room_name,
  status: meeting.status as MeetingDto["status"],
  startedAt: toIso(meeting.started_at),
  endedAt: toIso(meeting.ended_at),
  scheduledAt: toIso(meeting.scheduled_at),
  googleCalendarEventId: meeting.google_calendar_event_id,
  createdAt: meeting.created_at.toISOString(),
});

export const toTranscriptDto = (transcript: Transcript): TranscriptDto => ({
  id: transcript.id,
  meetingId: transcript.meeting_id,
  speakerId: transcript.speaker_id,
  content: transcript.content,
  timestamp: transcript.timestamp.toISOString(),
  createdAt: transcript.created_at.toISOString(),
});

export const toSummaryDto = (summary: Summary): SummaryDto => ({
  id: summary.id,
  meetingId: summary.meeting_id,
  content: summary.content,
  createdAt: summary.created_at.toISOString(),
});

export const toMeetingParticipantDto = (
  participant: MeetingParticipant
): MeetingParticipantDto => ({
  id: participant.id,
  meetingId: participant.meeting_id,
  userId: participant.user_id,
  guestIdentity: participant.guest_identity,
  displayName: participant.display_name,
  role: participant.role as MeetingParticipantDto["role"],
  joinedAt: participant.joined_at.toISOString(),
  leftAt: toIso(participant.left_at),
});

export const toRealtimeTranscriptSegmentDto = (
  segment: MeetingTranscriptSegment
): RealtimeTranscriptSegmentDto => ({
  id: segment.id,
  meetingId: segment.meeting_id,
  participantIdentity: segment.participant_identity,
  speakerUserId: segment.speaker_user_id,
  speakerLabel: segment.speaker_label,
  content: segment.content,
  isPartial: segment.is_partial,
  segmentKey: segment.segment_key,
  provider: segment.provider,
  confidence: segment.confidence,
  startedAt: segment.started_at.toISOString(),
  finalizedAt: segment.finalized_at?.toISOString() ?? null,
  createdAt: segment.created_at.toISOString(),
});
