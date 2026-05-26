import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { buildAutonomousDecisionPrompt } from "../../ai/agent/autonomous-decision-prompt.js";
import { initLlmWithSettings } from "../../ai/llm/index.js";
import { escapeXmlTags } from "../../ai/sanitize-prompt-input.js";
import {
  getLastAutonomousEventTime,
  listAutonomousActiveSessions,
  listFinalSegmentsAfter,
  updateSessionEvalCursor,
} from "../../repositories/meeting/meeting-realtime-repository.js";
import { releaseLeadership, tryAcquireLeadership } from "./autonomous-leader.js";
import { generateMeetingAgentResponse } from "./meeting-agent-runtime-service.js";
import { onTranscriptFinalized } from "./meeting-events.js";

const MIN_NEW_SEGMENTS = 3;
// Fallback safety-net interval. The primary trigger is event-driven (G4): a new
// finalized transcript segment schedules an evaluation. The interval only
// catches missed events / edge cases, so it can be much coarser than before.
const DEFAULT_INTERVAL_MS = 60_000;
// Collapse bursts of finalized segments into a single evaluation.
const EVENT_DEBOUNCE_MS = 1_000;

type ActiveSessionRow = Awaited<ReturnType<typeof listAutonomousActiveSessions>>[number];

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let tickRunning = false;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const meetingsInFlight = new Set<string>();

export function startAutonomousAgentLoop(intervalMs?: number): void {
  if (intervalHandle) return;
  const ms = intervalMs ?? DEFAULT_INTERVAL_MS;
  console.log(`Autonomous agent loop started (fallback interval: ${ms}ms, event-driven primary)`);
  intervalHandle = setInterval(() => {
    if (tickRunning) return; // skip if previous tick still running
    void runEvaluationTick();
  }, ms);

  unsubscribe = onTranscriptFinalized((event) => {
    scheduleMeetingEvaluation(event.meetingId);
  });
}

export async function stopAutonomousAgentLoop(): Promise<void> {
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
  // Await so the lock is actually released before the process exits (callers on
  // the shutdown path await this), enabling fast failover to another replica.
  await releaseLeadership();
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
      void (async () => {
        // Only the cluster-wide leader acts on events (G5).
        if (await tryAcquireLeadership()) {
          await evaluateMeeting(meetingId);
        }
      })().catch((err) => {
        console.error(`Autonomous event-driven eval error for meeting ${meetingId}:`, err);
      });
    }, EVENT_DEBOUNCE_MS)
  );
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
 */
async function evaluateMeeting(meetingId: string, prefetched?: ActiveSessionRow[]): Promise<void> {
  if (meetingsInFlight.has(meetingId)) {
    return;
  }
  meetingsInFlight.add(meetingId);
  try {
    const rows = prefetched ?? (await listAutonomousActiveSessions());
    for (const row of rows) {
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
    meetingsInFlight.delete(meetingId);
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

  const decision = await callDecisionLlm(agent, recentLines);
  if (!decision.shouldIntervene) {
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
  recentTranscriptLines: string[]
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

    const llmResult = await chatModel.invoke([new HumanMessage(prompt)]);
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
