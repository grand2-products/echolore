import { EventEmitter } from "node:events";

/**
 * In-process event bus for meeting realtime events. Used by G4 so the
 * autonomous agent loop can react to new transcript data immediately instead
 * of waiting for the periodic fallback tick.
 *
 * NOTE: this is process-local. With multiple API replicas, events only reach
 * listeners in the same process. Cross-process delivery (Valkey pub/sub) is a
 * follow-up tied to extracting the loop into a dedicated worker; the leader
 * election in G5 ensures only one replica acts on these events at a time.
 */
export const TRANSCRIPT_FINALIZED = "transcript.finalized";

export interface TranscriptFinalizedEvent {
  meetingId: string;
}

export const meetingEventBus = new EventEmitter();

export function emitTranscriptFinalized(meetingId: string): void {
  meetingEventBus.emit(TRANSCRIPT_FINALIZED, { meetingId } satisfies TranscriptFinalizedEvent);
}

/** Subscribe to transcript-finalized events. Returns an unsubscribe function. */
export function onTranscriptFinalized(
  handler: (event: TranscriptFinalizedEvent) => void
): () => void {
  meetingEventBus.on(TRANSCRIPT_FINALIZED, handler);
  return () => {
    meetingEventBus.off(TRANSCRIPT_FINALIZED, handler);
  };
}
