import { submitTranscriptSegment } from "../internal-api-client.js";
import { RealtimeTranscriptionSession } from "./realtime-session.js";
import type { AudioTranscriberFactory, RoomAudioSourceFactory, SegmentSink } from "./types.js";

export interface RealtimeManagerOptions {
  apiBaseUrl: string;
  workerSecret: string;
  languageCode: string;
  createSource: RoomAudioSourceFactory;
  createTranscriber: AudioTranscriberFactory;
  /** Resolve a meeting id from a LiveKit room name (null if none). */
  resolveMeetingId: (roomName: string) => Promise<string | null>;
}

/**
 * Owns the lifecycle of per-room realtime transcription sessions. Driven by the
 * LiveKit webhook server (room_started → start, room_finished → stop), so a
 * session exists only while the room is live.
 */
export class RealtimeTranscriptionManager {
  private readonly sessions = new Map<string, RealtimeTranscriptionSession>();

  constructor(private readonly opts: RealtimeManagerOptions) {}

  async startForRoom(roomName: string): Promise<void> {
    if (this.sessions.has(roomName)) return;

    const meetingId = await this.opts.resolveMeetingId(roomName);
    if (!meetingId) {
      console.warn(`[realtime] no meeting for room ${roomName}; skipping transcription`);
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
      source: this.opts.createSource({ roomName, meetingId }),
      createTranscriber: this.opts.createTranscriber,
      sink,
    });

    this.sessions.set(roomName, session);
    await session.start();
    console.log(`[realtime] started transcription room=${roomName} meeting=${meetingId}`);
  }

  async stopForRoom(roomName: string): Promise<void> {
    const session = this.sessions.get(roomName);
    if (!session) return;
    this.sessions.delete(roomName);
    await session.stop();
    console.log(`[realtime] stopped transcription room=${roomName}`);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((roomName) => this.stopForRoom(roomName)));
  }
}
