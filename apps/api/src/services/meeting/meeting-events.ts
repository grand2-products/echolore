import { EventEmitter } from "node:events";
import type Redis from "ioredis";
import { getValkey } from "../../lib/valkey.js";

/**
 * Event bus for meeting realtime events. Used by G4 so the autonomous agent
 * loop can react to new transcript data immediately instead of waiting for the
 * periodic fallback tick.
 *
 * H1: With multiple API replicas, in-process EventEmitter only delivers to
 * listeners in the same process; the leader (G5) may be in a different pod
 * than the one that received the transcript, so event-driven evaluation would
 * miss. We now ALSO publish on a Valkey pub/sub channel when Valkey is
 * available, and a per-process subscriber rebroadcasts incoming messages onto
 * the local EventEmitter. When Valkey is unavailable we degrade to pure
 * in-process delivery (matches the leader-election fallback in
 * autonomous-leader.ts: availability favoured over strict cross-pod delivery).
 */
export const TRANSCRIPT_FINALIZED = "transcript.finalized";
const TRANSCRIPT_CHANNEL = "echolore:meeting-events:transcript-finalized";

export interface TranscriptFinalizedEvent {
  meetingId: string;
}

/**
 * Abstract event bus so tests can swap in a stub without touching ioredis.
 * Production callers should keep using the module-level helpers below.
 */
export interface MeetingEventBus {
  emitTranscriptFinalized(meetingId: string): void;
  onTranscriptFinalized(handler: (event: TranscriptFinalizedEvent) => void): () => void;
}

/** Local-only EventEmitter, always present (fallback + same-process delivery). */
export const meetingEventBus = new EventEmitter();
// Listeners across many active meetings can stack up; lift the default 10-cap
// to avoid spurious "MaxListenersExceededWarning" log spam.
meetingEventBus.setMaxListeners(100);

// Subscriber bookkeeping. The duplicated Redis connection is created lazily on
// first emit/subscribe so non-meeting paths don't open a pub/sub socket.
let subscriber: Redis | null = null;
let subscriberStarted = false;

function startValkeySubscriberIfNeeded(): void {
  if (subscriberStarted) return;
  const valkey = getValkey();
  if (!valkey) return;
  subscriberStarted = true;
  try {
    // ioredis requires a dedicated connection for subscribe mode.
    subscriber = valkey.duplicate();
    subscriber.on("error", (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[meeting-events] subscriber error:", msg);
    });
    subscriber.on("message", (channel: string, message: string) => {
      if (channel !== TRANSCRIPT_CHANNEL) return;
      try {
        const parsed = JSON.parse(message) as TranscriptFinalizedEvent & { origin?: string };
        if (!parsed || typeof parsed.meetingId !== "string") return;
        // Re-emit locally so existing handlers (registered via
        // onTranscriptFinalized) receive cross-pod events the same way.
        meetingEventBus.emit(TRANSCRIPT_FINALIZED, {
          meetingId: parsed.meetingId,
        } satisfies TranscriptFinalizedEvent);
      } catch {
        // Drop malformed messages — never crash the subscriber loop.
      }
    });
    void subscriber.subscribe(TRANSCRIPT_CHANNEL).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[meeting-events] subscribe failed:", msg);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[meeting-events] failed to start subscriber:", msg);
    subscriber = null;
  }
}

// A process-unique tag so a publisher can recognize and skip its own messages
// when the local EventEmitter has already delivered them — avoids double-fire.
const PROCESS_TAG = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

export function emitTranscriptFinalized(meetingId: string): void {
  // 1. Always deliver in-process so single-instance / dev / test paths work
  //    and the leader pod doesn't need a Valkey round-trip when it is also
  //    the producer.
  meetingEventBus.emit(TRANSCRIPT_FINALIZED, { meetingId } satisfies TranscriptFinalizedEvent);

  // 2. Best-effort cross-pod fanout. Failures must never break ingest, so we
  //    swallow errors after a single warn.
  const valkey = getValkey();
  if (!valkey) return;
  startValkeySubscriberIfNeeded();
  try {
    void valkey
      .publish(
        TRANSCRIPT_CHANNEL,
        JSON.stringify({ meetingId, origin: PROCESS_TAG } satisfies TranscriptFinalizedEvent & {
          origin: string;
        })
      )
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[meeting-events] publish failed:", msg);
      });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[meeting-events] publish threw:", msg);
  }
}

/** Subscribe to transcript-finalized events. Returns an unsubscribe function. */
export function onTranscriptFinalized(
  handler: (event: TranscriptFinalizedEvent) => void
): () => void {
  // Make sure cross-pod events also reach this listener.
  startValkeySubscriberIfNeeded();
  meetingEventBus.on(TRANSCRIPT_FINALIZED, handler);
  return () => {
    meetingEventBus.off(TRANSCRIPT_FINALIZED, handler);
  };
}

/** Teardown the pub/sub subscriber. Intended for graceful shutdown / tests. */
export async function shutdownMeetingEventBus(): Promise<void> {
  if (!subscriber) {
    subscriberStarted = false;
    return;
  }
  try {
    await subscriber.unsubscribe(TRANSCRIPT_CHANNEL).catch(() => {});
    subscriber.disconnect();
  } catch {
    // ignore teardown errors
  }
  subscriber = null;
  subscriberStarted = false;
}
