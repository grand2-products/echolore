export type ActiveMeetingSnapshot = {
  id: string;
  roomName: string;
  startedAt: string | null;
};

/**
 * Identify "stale active" meetings: meetings marked `active` in the DB that have
 * no corresponding live LiveKit room.
 *
 * These arise because the `room_finished` → `ended` transition is event-driven,
 * and in production that event is never delivered to a handler that ends the
 * meeting (LiveKit posts to the API webhook, which ignores `room_finished`; the
 * worker's webhook server that would handle it only runs in webhook mode). The
 * monitor loop is therefore the only thing that can end meetings, and it does so
 * by reconciling against LiveKit's actual room list.
 *
 * `liveRoomNames` includes rooms still in their empty-room countdown
 * (LiveKit lists a room until `empty_timeout` elapses), so a room that is merely
 * empty is intentionally NOT treated as stale — we let LiveKit destroy it first.
 *
 * The grace period guards against ending a meeting that just became active before
 * its room appeared in `listRooms`, or one flipped to active manually with no
 * room. Only meetings whose `startedAt` is older than `graceMs` are returned;
 * meetings with an unknown/unparseable `startedAt` are skipped (too risky to end).
 */
export function selectStaleActiveMeetings(input: {
  activeMeetings: ActiveMeetingSnapshot[];
  liveRoomNames: Iterable<string>;
  now: Date;
  graceMs: number;
}): ActiveMeetingSnapshot[] {
  const liveRooms = new Set(input.liveRoomNames);
  const cutoff = input.now.getTime() - input.graceMs;

  return input.activeMeetings.filter((meeting) => {
    if (liveRooms.has(meeting.roomName)) return false; // room still alive (incl. empty-room countdown)
    if (!meeting.startedAt) return false; // unknown age — too risky to end
    const startedAt = Date.parse(meeting.startedAt);
    if (Number.isNaN(startedAt)) return false;
    return startedAt <= cutoff;
  });
}
