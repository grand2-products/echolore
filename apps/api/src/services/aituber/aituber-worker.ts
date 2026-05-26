import { EventEmitter } from "node:events";
import type { AituberCharacter } from "../../db/schema.js";
import * as livekitService from "./aituber-livekit-service.js";
import * as aituberService from "./aituber-service.js";
import { loadMotionRegistry } from "./motion-registry.js";

/**
 * AITuber processing-worker lifecycle.
 *
 * One worker per live session. The worker is event-driven:
 *   1. drain `aituber_messages` rows where `processedAt IS NULL` (FIFO)
 *   2. when the queue is empty, wait on the in-process EventEmitter channel
 *      (`message:<sessionId>`) for the next viewer message, or wake on the
 *      SAFETY_TICK_MS timer as recovery from a missed `notifyNewMessage`.
 *
 * The actual per-message LLM / TTS work is delegated to
 * `processNextMessage` (see `aituber-ai-service`) so this module stays
 * concerned solely with scheduling, abort handling, and teardown.
 */

export interface SessionWorkerState {
  running: boolean;
  character: AituberCharacter;
  roomName: string;
}

/** Signature of the per-message worker step — injected to avoid a cyclic import. */
export type ProcessNextMessageFn = (
  sessionId: string,
  character: AituberCharacter,
  roomName: string
) => Promise<boolean>;

const activeLoops = new Map<string, SessionWorkerState>();
const messageEvents = new EventEmitter();
messageEvents.setMaxListeners(0);

const SAFETY_TICK_MS = 60_000; // periodic re-check in case a notify was missed
const MAX_CONSECUTIVE_ERRORS = 10;

/**
 * Wait until either an event on `channel` fires or `timeoutMs` elapses.
 * Always cleans up the listener.
 */
function waitForMessageOrTimeout(channel: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      messageEvents.off(channel, handler);
      resolve();
    }, timeoutMs);
    messageEvents.once(channel, handler);
  });
}

/**
 * Notify the AI worker for `sessionId` that a new viewer message has arrived.
 * Called by the HTTP route immediately after the message is persisted.
 *
 * Safe to call when no worker is active (no-op).
 */
export function notifyNewMessage(sessionId: string): void {
  messageEvents.emit(`message:${sessionId}`);
}

/**
 * Starts the AI processing worker for a session.
 *
 * The worker is event-driven: it drains all unprocessed messages on start,
 * then waits on `messageEvents` until a viewer posts or `SAFETY_TICK_MS`
 * elapses (recovery from missed events).
 *
 * Calling twice for the same `sessionId` is a no-op (single worker per session).
 */
export function startProcessingLoop(
  sessionId: string,
  character: AituberCharacter,
  roomName: string,
  processNextMessage: ProcessNextMessageFn
): void {
  if (activeLoops.has(sessionId)) return;

  const state: SessionWorkerState = { running: true, character, roomName };
  activeLoops.set(sessionId, state);

  // Best-effort: load the motion manifest so action-tag validation is active
  // by the time the worker handles its first message.
  void loadMotionRegistry().catch((err) =>
    console.warn("[aituber-ai] Failed to load motion manifest:", err)
  );

  console.log(`[aituber-ai] Starting processing worker for session ${sessionId}`);

  void runWorker(sessionId, state, processNextMessage);
}

async function runWorker(
  sessionId: string,
  state: SessionWorkerState,
  processNextMessage: ProcessNextMessageFn
): Promise<void> {
  const channel = `message:${sessionId}`;
  let consecutiveErrors = 0;
  let aborted = false;

  while (state.running) {
    let processed = false;
    try {
      processed = await processNextMessage(sessionId, state.character, state.roomName);
      if (processed) consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors++;
      console.error(
        JSON.stringify({
          event: "aituber-ai.error",
          sessionId,
          count: consecutiveErrors,
          max: MAX_CONSECUTIVE_ERRORS,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(
          JSON.stringify({
            event: "aituber-ai.aborted",
            sessionId,
            reason: "too_many_consecutive_errors",
          })
        );
        state.running = false;
        aborted = true;
        break;
      }
      // Backoff briefly on transient errors so we don't spin on a poisonous
      // message that keeps reappearing as unprocessed.
      await sleep(Math.min(2000, 200 * consecutiveErrors));
      continue;
    }
    if (!processed) {
      // Queue is empty — wait for the next notification or a safety tick.
      await waitForMessageOrTimeout(channel, SAFETY_TICK_MS);
    }
  }

  activeLoops.delete(sessionId);
  if (aborted) {
    await tearDownAbortedSession(sessionId, state.roomName);
  }
  console.log(`[aituber-ai] Stopped processing worker for session ${sessionId}`);
}

/**
 * Clean up a session that the AI loop abandoned after MAX_CONSECUTIVE_ERRORS.
 * Without this, the session stays `live` forever and viewers see a frozen avatar.
 *
 * Order matters: broadcast `session-aborted` first (so viewers see the overlay),
 * then transition the DB row and finally delete the LiveKit room.
 */
export async function tearDownAbortedSession(sessionId: string, roomName: string): Promise<void> {
  // Notify viewers before we tear down the room.
  await livekitService
    .sendDataToRoom(roomName, { type: "session-aborted" })
    .catch((err) =>
      console.warn(`[aituber-ai] Failed to broadcast session-aborted for ${sessionId}:`, err)
    );
  // Best-effort transition `live` → `ended`. abortSession only fires on `created`,
  // and stopSession only on `live`, so try both and ignore mismatches.
  await aituberService
    .stopSession(sessionId)
    .catch(() => aituberService.abortSession(sessionId).catch(() => {}));
  await livekitService
    .deleteAituberRoom(roomName)
    .catch((err) => console.warn(`[aituber-ai] Failed to delete LiveKit room ${roomName}:`, err));
}

/**
 * Stops the AI processing worker for a session.
 *
 * The worker exits cleanly the next time it checks `state.running`. We
 * additionally fire a notification so a worker waiting on the channel wakes
 * up immediately instead of holding the SAFETY_TICK_MS timer.
 */
export function stopProcessingLoop(sessionId: string): void {
  const state = activeLoops.get(sessionId);
  if (state) {
    state.running = false;
    notifyNewMessage(sessionId);
    // activeLoops entry is cleaned up by the worker itself after it exits.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
