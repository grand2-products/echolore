import type { RealtimeTranscriptionManager } from "./manager.js";

export interface RealtimeReconcileOptions {
  manager: RealtimeTranscriptionManager;
  /** Lists live LiveKit rooms (by name). Wired to the existing monitor helper. */
  listLiveRoomNames: () => Promise<string[]>;
}

/**
 * Re-attach realtime sessions to LiveKit rooms that are still live but whose
 * room_started webhook fired before the current worker was running. Called
 * once on worker startup, after the webhook server is listening.
 *
 * The manager's ownership lock dedupes against other workers, so this is safe
 * to run on every restart even if a sibling worker is already attached.
 */
export async function reconcileOrphanRooms(opts: RealtimeReconcileOptions): Promise<void> {
  let rooms: string[];
  try {
    rooms = await opts.listLiveRoomNames();
  } catch (err) {
    console.error("[realtime] orphan reconcile failed to list rooms", err);
    return;
  }

  if (rooms.length === 0) {
    console.log("[realtime] orphan reconcile: no live rooms");
    return;
  }

  // Run starts in parallel; each one is idempotent and short-circuits when the
  // ownership lock is held by another worker.
  await Promise.all(
    rooms.map((roomName) =>
      opts.manager.startForRoom(roomName).catch((err) => {
        console.error(`[realtime] orphan reconcile startForRoom failed room=${roomName}`, err);
      })
    )
  );

  console.log(`[realtime] orphan reconcile attempted ${rooms.length} room(s)`);
}
