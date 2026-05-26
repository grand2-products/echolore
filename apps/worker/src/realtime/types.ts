/**
 * G3 — realtime transcription contracts.
 *
 * The orchestration (realtime-session.ts / manager.ts) is written against these
 * interfaces so it can be unit-tested with fakes. The two boundaries that need
 * real infrastructure — LiveKit room media (@livekit/rtc-node) and streaming STT
 * (Google Cloud Speech) — are isolated behind `RoomAudioSource` and
 * `AudioTranscriber` respectively. See rtc-node-audio-source.ts /
 * google-stt-transcriber.ts for the runtime-verification boundary.
 */

/** A chunk of mono PCM signed-16-bit audio captured from a participant's track. */
export interface AudioChunk {
  participantIdentity: string;
  samples: Int16Array;
  sampleRate: number;
}

/** A partial or final transcription result for one participant utterance. */
export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  confidence?: number;
}

/**
 * Streaming speech-to-text for a single participant's audio stream.
 * One instance per participant; implementations stream interim + final results.
 */
export interface AudioTranscriber {
  pushAudio(chunk: AudioChunk): void;
  onResult(handler: (result: TranscriptResult) => void): void;
  close(): Promise<void>;
}

export type AudioTranscriberFactory = (
  participantIdentity: string,
  languageCode: string
) => AudioTranscriber;

/**
 * Abstracts the LiveKit room media plane: connecting as a hidden participant,
 * subscribing to remote audio tracks, and surfacing decoded PCM chunks.
 */
export interface RoomAudioSource {
  connect(): Promise<void>;
  onAudioChunk(handler: (chunk: AudioChunk) => void): void;
  onParticipantLeft(handler: (participantIdentity: string) => void): void;
  /**
   * Notified when the underlying connection to LiveKit is lost (token expiry,
   * network drop, or server-side disconnect). The manager stops the session
   * and may re-attach. Optional: not every source implementation reports it.
   */
  onDisconnected?(handler: (reason: string) => void): void;
  disconnect(): Promise<void>;
}

export type RoomAudioSourceFactory = (input: {
  roomName: string;
  meetingId: string;
  /**
   * Forwarded by the manager. The source calls this when LiveKit reports the
   * connection is lost so the manager can react (stop + optional re-attach).
   */
  onDisconnected?: (reason: string) => void;
}) => RoomAudioSource;

/** Persists a transcript segment (implementation: internal room-ai API). */
export interface SegmentSink {
  submit(segment: {
    participantIdentity: string;
    speakerLabel: string;
    content: string;
    isPartial: boolean;
    segmentKey: string;
    provider: string;
    confidence: number | null;
    startedAt: string;
    finalizedAt: string | null;
  }): Promise<void>;
}
