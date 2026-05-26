import type {
  AudioFrame,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
} from "@livekit/rtc-node";
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
  /**
   * Notified when LiveKit reports the connection is gone (token expiry,
   * network drop, server-side disconnect). The manager uses this to stop and
   * potentially re-attach the session. Receives a free-form reason string for
   * logging.
   */
  onDisconnected?: (reason: string) => void;
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
  /**
   * Track the reader bound to each (participantIdentity, trackSid) so we can
   * tear it down on `TrackUnsubscribed` (mute / republish / participant gone).
   * Without this, a stuck reader sits in `reader.read()` forever after the
   * peer republishes its track and we miss the replacement audio.
   */
  private readonly trackReaders = new Map<string, ReadableStreamDefaultReader<AudioFrame>>();
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
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind !== TrackKind.KIND_AUDIO) return;
        const sid =
          (publication as { sid?: string }).sid ?? (track as unknown as { sid?: string }).sid ?? "";
        this.consumeTrack(new AudioStream(track, STT_SAMPLE_RATE, 1), participant.identity, sid);
      }
    );
    room.on(
      RoomEvent.TrackUnsubscribed,
      (
        _track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        // Cancel the bound reader so the consume loop unblocks. Without this,
        // a peer that mutes-then-unmutes (republishes) leaves the previous
        // reader hanging on `reader.read()` forever.
        const sid =
          (publication as { sid?: string }).sid ??
          (publication as unknown as { trackSid?: string }).trackSid ??
          "";
        const key = this.readerKey(participant.identity, sid);
        const reader = this.trackReaders.get(key);
        if (reader) {
          this.trackReaders.delete(key);
          void reader.cancel().catch(() => {});
        }
      }
    );
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.leftHandler?.(participant.identity);
    });
    room.on(RoomEvent.Disconnected, (reason: unknown) => {
      // LiveKit fires this for token expiry, network drop, or server-side
      // disconnect. Surface it so the manager can stop the session and decide
      // whether to re-attach. We avoid auto-reconnecting here — the SDK
      // already does that for transient drops; this event means it gave up.
      const reasonText = String(reason ?? "unknown");
      console.warn(
        `[realtime] LiveKit disconnected room=${this.options.roomName} reason=${reasonText}`
      );
      this.options.onDisconnected?.(reasonText);
    });

    await room.connect(this.options.livekitHost, await token.toJwt(), {
      autoSubscribe: true,
      dynacast: false,
    });
  }

  private readerKey(participantIdentity: string, trackSid: string): string {
    return `${participantIdentity}::${trackSid}`;
  }

  private consumeTrack(
    stream: ReadableStream<AudioFrame>,
    participantIdentity: string,
    trackSid: string
  ): void {
    const reader = stream.getReader();
    this.readers.add(reader);
    const key = this.readerKey(participantIdentity, trackSid);
    // If a previous track for this sid is still being read (republish without
    // an explicit unsubscribe), cancel it before we replace it.
    const previous = this.trackReaders.get(key);
    if (previous) {
      void previous.cancel().catch(() => {});
    }
    this.trackReaders.set(key, reader);
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
        if (this.trackReaders.get(key) === reader) {
          this.trackReaders.delete(key);
        }
      }
    })();
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    for (const reader of this.readers) {
      await reader.cancel().catch(() => {});
    }
    this.readers.clear();
    this.trackReaders.clear();
    await this.room?.disconnect().catch(() => {});
    this.room = null;
  }
}

export function createRtcNodeAudioSource(options: RtcNodeAudioSourceOptions): RoomAudioSource {
  return new RtcNodeAudioSource(options);
}
