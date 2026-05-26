import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { buildAutonomousDecisionPrompt } from "../../ai/agent/autonomous-decision-prompt.js";
import { initLlmWithSettings } from "../../ai/llm/index.js";
import { escapeXmlTags } from "../../ai/sanitize-prompt-input.js";
import { getValkey } from "../../lib/valkey.js";
import {
  getLastAutonomousEventTime,
  listAutonomousActiveSessions,
  listFinalSegmentsAfter,
  updateSessionEvalCursor,
} from "../../repositories/meeting/meeting-realtime-repository.js";
import { getInstanceId, releaseLeadership, tryAcquireLeadership } from "./autonomous-leader.js";
import { generateMeetingAgentResponse } from "./meeting-agent-runtime-service.js";
import { onTranscriptFinalized } from "./meeting-events.js";

const MIN_NEW_SEGMENTS = 3;
// Fallback safety-net interval. The primary trigger is event-driven (G4): a new
// finalized transcript segment schedules an evaluation. The interval only
// catches missed events / edge cases, so it can be much coarser than before.
const DEFAULT_INTERVAL_MS = 60_000;
// Collapse bursts of finalized segments into a single evaluation.
const EVENT_DEBOUNCE_MS = 1_000;
// Cluster-wide per-meeting evaluation lock TTL. Should comfortably exceed the
// time for one evaluateAgent call (LLM round-trip + DB updates) but be short
// enough that a crashed leader doesn't permanently block subsequent rounds.
const MEETING_INFLIGHT_TTL_MS = 30_000;

type ActiveSessionRow = Awaited<ReturnType<typeof listAutonomousActiveSessions>>[number];

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let tickRunning = false;
let shuttingDown = false;
// M7: AbortController surfaced for future use (LLM providers that honor
// AbortSignal). Today we only use its `signal.aborted` as a fast-path inside
// loops; LangChain's Chat models accept it via the `signal` option when we
// thread it through. Keeping it on the module so callers can pass it down
// when wiring is added.
let shutdownAbort: AbortController | null = null;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
// In-process fallback set. With Valkey present, cross-pod exclusion comes from
// the per-meeting `SET NX EX` lock (M2); we keep this in-process Set so the
// fallback path (no Valkey) still prevents double-evaluation within a process.
const meetingsInFlight = new Set<string>();
// Track in-flight evaluation promises so stopAutonomousAgentLoop can await
// them on shutdown (M7).
const inFlightPromises = new Set<Promise<void>>();

function meetingInFlightKey(meetingId: string): string {
  return `echolore:autonomous-eval:in-flight:${meetingId}`;
}

/**
 * M2: Try to claim the per-meeting evaluation slot. With Valkey, use SET NX PX
 * so two pods can't both evaluate the same meeting simultaneously. Without
 * Valkey, fall back to an in-process Set (process-local — better than nothing
 * for single-replica deploys).
 *
 * Returns true when the caller acquired the slot and is responsible for
 * releasing it.
 */
async function acquireMeetingInFlight(meetingId: string): Promise<boolean> {
  // In-process gate first: avoids the Valkey round-trip on dev / single-pod
  // and ensures we don't double-evaluate within the same process even when
  // Valkey is unavailable.
  if (meetingsInFlight.has(meetingId)) {
    return false;
  }

  const valkey = getValkey();
  if (valkey) {
    try {
      const result = await valkey.set(
        meetingInFlightKey(meetingId),
        getInstanceId(),
        "PX",
        MEETING_INFLIGHT_TTL_MS,
        "NX"
      );
      if (result !== "OK") {
        return false;
      }
    } catch (err) {
      // Valkey hiccup — degrade to in-process gating rather than blocking
      // everyone. The DB-side cooldown + cursor still bound duplicate
      // interventions in the worst case.
      console.warn(
        "[autonomous-agent] in-flight lock SET NX failed; falling back to in-process gate:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  meetingsInFlight.add(meetingId);
  return true;
}

async function releaseMeetingInFlight(meetingId: string): Promise<void> {
  meetingsInFlight.delete(meetingId);
  const valkey = getValkey();
  if (!valkey) return;
  try {
    // CAS-style release: only delete if this instance still owns the slot,
    // matching the leader-lock pattern. Cheap eval beats GET-then-DEL.
    await valkey.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
      1,
      meetingInFlightKey(meetingId),
      getInstanceId()
    );
  } catch {
    // best-effort: TTL guarantees the key eventually clears
  }
}

export function startAutonomousAgentLoop(intervalMs?: number): void {
  if (intervalHandle) return;
  shuttingDown = false;
  shutdownAbort = new AbortController();
  const ms = intervalMs ?? DEFAULT_INTERVAL_MS;
  console.log(`Autonomous agent loop started (fallback interval: ${ms}ms, event-driven primary)`);
  intervalHandle = setInterval(() => {
    if (tickRunning) return; // skip if previous tick still running
    void runEvaluationTick();
  }, ms);

  unsubscribe = onTranscriptFinalized((event) => {
    if (shuttingDown) return;
    scheduleMeetingEvaluation(event.meetingId);
  });
}

export async function stopAutonomousAgentLoop(): Promise<void> {
  shuttingDown = true;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
  // M7: signal in-flight evaluations to abort (best-effort: LLM providers may
  // not honor it, but at least DB queries on supported drivers will short-circuit).
  if (shutdownAbort) {
    shutdownAbort.abort();
  }
  // Wait for in-flight evaluations to settle (M7) so the lock is only released
  // after they finish.
  if (inFlightPromises.size > 0) {
    await Promise.allSettled(Array.from(inFlightPromises));
  }
  // Await so the lock is actually released before the process exits (callers on
  // the shutdown path await this), enabling fast failover to another replica.
  await releaseLeadership();
  shutdownAbort = null;
  console.log("Autonomous agent loop stopped");
}

function scheduleMeetingEvaluation(meetingId: string): void {
  const existing = debounceTimers.get(meetingId);
  if (existing) {
    clearTimeout(existing);
  }
  debounceTimers.set(
    meetingId,
    setTimeout(() => {
      debounceTimers.delete(meetingId);
      if (shuttingDown) return;
      const task = (async () => {
        // Only the cluster-wide leader acts on events (G5).
        if (await tryAcquireLeadership()) {
          await evaluateMeeting(meetingId);
        }
      })().catch((err) => {
        console.error(`Autonomous event-driven eval error for meeting ${meetingId}:`, err);
      });
      trackInFlight(task);
    }, EVENT_DEBOUNCE_MS)
  );
}

function trackInFlight(task: Promise<void>): void {
  inFlightPromises.add(task);
  void task.finally(() => {
    inFlightPromises.delete(task);
  });
}

async function runEvaluationTick(): Promise<void> {
  tickRunning = true;
  try {
    // Only one replica runs the evaluation at a time, even if the API is
    // horizontally scaled (G5). Degrades to running locally if Valkey is down.
    if (!(await tryAcquireLeadership())) {
      return;
    }
    const rows = await listAutonomousActiveSessions();
    const meetingIds = new Set(rows.map((row) => row.session.meetingId));
    for (const meetingId of meetingIds) {
      if (shuttingDown) break;
      await evaluateMeeting(meetingId, rows);
    }
  } catch (err) {
    console.error("Autonomous tick error:", err);
  } finally {
    tickRunning = false;
  }
}

/**
 * Evaluate all active autonomous sessions for a single meeting. Guarded by a
 * per-meeting in-flight set so the event-driven path and the fallback tick
 * never evaluate the same meeting concurrently (which could double-fire an
 * intervention before the eval cursor / cooldown is persisted).
 *
 * The in-flight gate is now also cluster-wide (M2): with Valkey present, two
 * pods can't both enter evaluateMeeting for the same meeting.
 */
async function evaluateMeeting(meetingId: string, prefetched?: ActiveSessionRow[]): Promise<void> {
  const claimed = await acquireMeetingInFlight(meetingId);
  if (!claimed) {
    return;
  }
  try {
    const rows = prefetched ?? (await listAutonomousActiveSessions());
    for (const row of rows) {
      if (shuttingDown) return;
      if (row.session.meetingId !== meetingId) {
        continue;
      }
      try {
        await evaluateAgent(row.session, row.agent);
      } catch (err) {
        console.error(`Autonomous eval error for session ${row.session.id}:`, err);
      }
    }
  } catch (err) {
    console.error(`Autonomous eval error for meeting ${meetingId}:`, err);
  } finally {
    await releaseMeetingInFlight(meetingId);
  }
}

async function evaluateAgent(
  session: {
    id: string;
    meetingId: string;
    agentId: string;
    lastAutoEvalSegmentId: string | null;
    invokedByUserId: string;
  },
  agent: {
    id: string;
    name: string;
    systemPrompt: string;
    interventionStyle: string;
    defaultProvider: string;
    autonomousCooldownSec: number;
  }
): Promise<void> {
  // Stage 1a: Check for new finalized segments
  const newSegments = await listFinalSegmentsAfter(
    session.meetingId,
    session.lastAutoEvalSegmentId
  );

  if (newSegments.length < MIN_NEW_SEGMENTS) {
    return;
  }

  // Stage 1b: Cooldown check
  const lastAutoTime = await getLastAutonomousEventTime(session.meetingId, agent.id);
  if (lastAutoTime) {
    const elapsed = (Date.now() - lastAutoTime.getTime()) / 1000;
    if (elapsed < agent.autonomousCooldownSec) {
      return;
    }
  }

  // Update cursor regardless of decision outcome
  const latestSegmentId = newSegments[newSegments.length - 1]?.id ?? "";
  await updateSessionEvalCursor(session.id, latestSegmentId);

  // Stage 2: LLM decision
  const recentLines = newSegments.map(
    (seg) =>
      `<transcript_line>${escapeXmlTags(`${seg.speakerLabel}: ${seg.content}`)}</transcript_line>`
  );

  // M1: fencing — re-check leadership immediately before the LLM call. The
  // initial tryAcquireLeadership at tick start can become stale during long
  // DB queries / cooldown checks, so a fresh check here prevents a former
  // leader (whose TTL just expired) from speaking after a new leader has
  // already been elected. This is a lightweight last line of defence; full
  // fencing-token semantics (UNIQUE constraint on event insert keyed by
  // sessionId+round+instanceId) is left as a follow-up.
  if (!(await tryAcquireLeadership())) {
    return;
  }

  // M7: bail out cleanly if shutdown was requested while we were waiting on
  // DB queries above. We do this after the cursor update so the next leader
  // starts from the correct position.
  if (shuttingDown) {
    return;
  }

  const decision = await callDecisionLlm(agent, recentLines, shutdownAbort?.signal);
  if (!decision.shouldIntervene) {
    return;
  }

  // Re-check once more before actually triggering the response: the LLM call
  // can take seconds, plenty of time for leadership to change hands.
  if (!(await tryAcquireLeadership())) {
    return;
  }
  if (shuttingDown) {
    return;
  }

  // Intervene using the existing pipeline
  await generateMeetingAgentResponse({
    meetingId: session.meetingId,
    agentId: agent.id,
    prompt: decision.suggestedPrompt,
    triggeredByUserId: session.invokedByUserId,
    triggerMode: "autonomous",
  });
}

async function callDecisionLlm(
  agent: {
    name: string;
    systemPrompt: string;
    interventionStyle: string;
    defaultProvider: string;
  },
  recentTranscriptLines: string[],
  signal?: AbortSignal
): Promise<{ shouldIntervene: boolean; reason: string; suggestedPrompt: string }> {
  const result = await initLlmWithSettings({
    temperature: 0,
    maxTokens: 200,
    feature: "meetingAgent",
  });

  if (!result) {
    return { shouldIntervene: false, reason: "LLM not configured", suggestedPrompt: "" };
  }

  try {
    const chatModel = result.model;

    const prompt = buildAutonomousDecisionPrompt({
      agentName: escapeXmlTags(agent.name),
      interventionStyle: escapeXmlTags(agent.interventionStyle),
      systemPrompt: escapeXmlTags(agent.systemPrompt),
      recentTranscriptLines,
    });

    // M7: pass the shutdown abort signal so providers that honor it can
    // cancel in-flight requests instead of holding the event loop open.
    const llmResult = await chatModel.invoke([new HumanMessage(prompt)], signal ? { signal } : {});
    const text =
      typeof llmResult.content === "string"
        ? llmResult.content.trim()
        : String(llmResult.content).trim();

    // Parse and validate JSON response
    const DecisionSchema = z.object({
      shouldIntervene: z.boolean(),
      reason: z.string().optional().default(""),
      suggestedPrompt: z.string().optional().default(""),
    });

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(text);
    } catch {
      return {
        shouldIntervene: false,
        reason: "Invalid JSON from decision LLM",
        suggestedPrompt: "",
      };
    }

    const parsed = DecisionSchema.safeParse(rawJson);
    if (!parsed.success) {
      return {
        shouldIntervene: false,
        reason: "Invalid schema from decision LLM",
        suggestedPrompt: "",
      };
    }

    return {
      shouldIntervene: parsed.data.shouldIntervene,
      reason: parsed.data.reason,
      suggestedPrompt: parsed.data.suggestedPrompt,
    };
  } catch {
    return { shouldIntervene: false, reason: "Decision LLM call failed", suggestedPrompt: "" };
  }
}
