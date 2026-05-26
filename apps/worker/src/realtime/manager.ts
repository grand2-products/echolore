import { submitTranscriptSegment } from "../internal-api-client.js";
import { RealtimeTranscriptionSession } from "./realtime-session.js";
import { createInMemoryRoomOwnership, type RoomOwnership } from "./room-ownership.js";
import type { AudioTranscriberFactory, RoomAudioSourceFactory, SegmentSink } from "./types.js";

export interface RealtimeManagerOptions {
  apiBaseUrl: string;
  workerSecret: string;
  languageCode: string;
  createSource: RoomAudioSourceFactory;
  createTranscriber: AudioTranscriberFactory;
  /** Resolve a meeting id from a LiveKit room name (null if none). */
  resolveMeetingId: (roomName: string) => Promise<string | null>;
  /**
   * Distributed ownership registry. Defaults to an in-process implementation
   * (single-worker deployments don't need Valkey). Production deployments
   * with >1 realtime worker MUST pass the Valkey-backed registry.
   */
  ownership?: RoomOwnership;
  /** How often to refresh held room locks. Defaults to 10s. */
  ownershipRefreshIntervalMs?: number;
}

interface SessionEntry {
  session: RealtimeTranscriptionSession;
  /** Cleared by `stopForRoom` so we never refresh a lock after release. */
  refreshTimer: NodeJS.Timeout | null;
}

/**
 * Owns the lifecycle of per-room realtime transcription sessions. Driven by the
 * LiveKit webhook server (room_started → start, room_finished → stop), so a
 * session exists only while the room is live.
 */
export class RealtimeTranscriptionManager {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly ownership: RoomOwnership;
  private readonly refreshIntervalMs: number;

  constructor(private readonly opts: RealtimeManagerOptions) {
    this.ownership = opts.ownership ?? createInMemoryRoomOwnership();
    this.refreshIntervalMs = opts.ownershipRefreshIntervalMs ?? 10_000;
  }

  /**
   * Start a session for `roomName`. Idempotent: returns immediately if this
   * worker already runs the session OR if another worker holds the ownership
   * lock. Throws only on transcriber/source setup failure for a lock we hold.
   */
  async startForRoom(roomName: string): Promise<void> {
    if (this.sessions.has(roomName)) return;

    const meetingId = await this.opts.resolveMeetingId(roomName);
    if (!meetingId) {
      console.warn(`[realtime] no meeting for room ${roomName}; skipping transcription`);
      return;
    }

    // Race the lock — only the worker that wins ingests audio. The runner-up
    // returns silently; if the winner crashes the lock TTL eventually expires
    // and the next room_started or the orphan reconciler retries.
    const acquired = await this.ownership.acquire(roomName).catch((err) => {
      console.error(`[realtime] ownership acquire failed room=${roomName}`, err);
      return false;
    });
    if (!acquired) {
      console.log(`[realtime] room=${roomName} owned by another worker; skipping`);
      return;
    }

    const sink: SegmentSink = {
      submit: async (segment) => {
        await submitTranscriptSegment({
          apiBaseUrl: this.opts.apiBaseUrl,
          workerSecret: this.opts.workerSecret,
          meetingId,
          ...segment,
        });
      },
    };

    const session = new RealtimeTranscriptionSession({
      meetingId,
      languageCode: this.opts.languageCode,
      source: this.opts.createSource({
        roomName,
        meetingId,
        // LiveKit lost the connection (token expiry / network drop). Stop the
        // session so we release the lock; webhook-driven restarts or the
        // orphan reconciler will re-attach when appropriate.
        onDisconnected: (reason) => {
          console.warn(
            `[realtime] source disconnected room=${roomName} reason=${reason}; stopping`
          );
          void this.stopForRoom(roomName).catch((err) => {
            console.error(`[realtime] stopForRoom on disconnect failed room=${roomName}`, err);
          });
        },
      }),
      createTranscriber: this.opts.createTranscriber,
      sink,
    });

    const entry: SessionEntry = { session, refreshTimer: null };
    this.sessions.set(roomName, entry);
    try {
      await session.start();
    } catch (err) {
      this.sessions.delete(roomName);
      await this.ownership.release(roomName).catch(() => {});
      throw err;
    }

    entry.refreshTimer = setInterval(() => {
      void this.ownership.refresh(roomName).then((ok) => {
        if (!ok && this.sessions.has(roomName)) {
          console.warn(`[realtime] lost ownership of room=${roomName}; stopping session`);
          void this.stopForRoom(roomName).catch(() => {});
        }
      });
    }, this.refreshIntervalMs);
    entry.refreshTimer.unref?.();

    console.log(`[realtime] started transcription room=${roomName} meeting=${meetingId}`);
  }

  async stopForRoom(roomName: string): Promise<void> {
    const entry = this.sessions.get(roomName);
    if (!entry) return;
    this.sessions.delete(roomName);
    if (entry.refreshTimer) {
      clearInterval(entry.refreshTimer);
      entry.refreshTimer = null;
    }
    await entry.session.stop();
    await this.ownership.release(roomName).catch(() => {});
    console.log(`[realtime] stopped transcription room=${roomName}`);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((roomName) => this.stopForRoom(roomName)));
    await this.ownership.close().catch(() => {});
  }

  /** Test/diagnostics: how many rooms this worker currently owns. */
  get activeRoomCount(): number {
    return this.sessions.size;
  }
}
