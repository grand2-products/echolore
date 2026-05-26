import type { AudioFrame, RemoteParticipant, RemoteTrack, Room } from "@livekit/rtc-node";
import { AccessToken } from "livekit-server-sdk";
import type { AudioChunk, RoomAudioSource } from "./types.js";

export interface RtcNodeAudioSourceOptions {
  roomName: string;
  meetingId: string;
  livekitHost: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  /** Identity the worker joins as. Hidden from the participant list. */
  identity?: string;
}

// Resample participant audio to 16 kHz mono — the format Google streaming STT
// expects (LINEAR16 @ 16 kHz). @livekit/rtc-node's AudioStream resamples for us.
const STT_SAMPLE_RATE = 16_000;

/**
 * Concrete `RoomAudioSource` backed by the native @livekit/rtc-node client.
 *
 * `@livekit/rtc-node` is imported dynamically inside `connect()` so the native
 * module is only loaded when the realtime worker actually joins a room — the
 * monitor / webhook worker modes never touch it. Types are pulled in via
 * `import type`, which is erased at compile time and does not load the module.
 *
 * RUNTIME-VERIFICATION BOUNDARY (G3): the media path cannot be exercised in CI;
 * it requires a live LiveKit server. The code below typechecks against the real
 * SDK but its behavior must be verified against a running deployment (#47).
 */
class RtcNodeAudioSource implements RoomAudioSource {
  private room: Room | null = null;
  private audioHandler: ((chunk: AudioChunk) => void) | null = null;
  private leftHandler: ((participantIdentity: string) => void) | null = null;
  private readonly readers = new Set<ReadableStreamDefaultReader<AudioFrame>>();
  private closed = false;

  constructor(private readonly options: RtcNodeAudioSourceOptions) {}

  onAudioChunk(handler: (chunk: AudioChunk) => void): void {
    this.audioHandler = handler;
  }

  onParticipantLeft(handler: (participantIdentity: string) => void): void {
    this.leftHandler = handler;
  }

  async connect(): Promise<void> {
    const { Room, RoomEvent, AudioStream, TrackKind } = await import("@livekit/rtc-node");

    const identity = this.options.identity ?? `worker-${this.options.meetingId}`;
    const token = new AccessToken(this.options.livekitApiKey, this.options.livekitApiSecret, {
      identity,
    });
    // Hidden, subscribe-only participant: it observes audio but never appears in
    // the participant list and cannot publish.
    token.addGrant({
      roomJoin: true,
      room: this.options.roomName,
      canSubscribe: true,
      canPublish: false,
      hidden: true,
    });

    const room = new Room();
    this.room = room;

    room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        if (track.kind !== TrackKind.KIND_AUDIO) return;
        this.consumeTrack(new AudioStream(track, STT_SAMPLE_RATE, 1), participant.identity);
      }
    );
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.leftHandler?.(participant.identity);
    });

    await room.connect(this.options.livekitHost, await token.toJwt(), {
      autoSubscribe: true,
      dynacast: false,
    });
  }

  private consumeTrack(stream: ReadableStream<AudioFrame>, participantIdentity: string): void {
    const reader = stream.getReader();
    this.readers.add(reader);
    void (async () => {
      try {
        while (!this.closed) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          this.audioHandler?.({
            participantIdentity,
            samples: value.data,
            sampleRate: value.sampleRate,
          });
        }
      } catch {
        // Reader cancelled or stream errored (e.g. on disconnect) — stop reading.
      } finally {
        this.readers.delete(reader);
      }
    })();
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    for (const reader of this.readers) {
      await reader.cancel().catch(() => {});
    }
    this.readers.clear();
    await this.room?.disconnect().catch(() => {});
    this.room = null;
  }
}

export function createRtcNodeAudioSource(options: RtcNodeAudioSourceOptions): RoomAudioSource {
  return new RtcNodeAudioSource(options);
}
