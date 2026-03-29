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
import { generateMeetingAgentResponse } from "./meeting-agent-runtime-service.js";

const MIN_NEW_SEGMENTS = 3;
const DEFAULT_INTERVAL_MS = 20_000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let tickRunning = false;

export function startAutonomousAgentLoop(intervalMs?: number): void {
  if (intervalHandle) return;
  const ms = intervalMs ?? DEFAULT_INTERVAL_MS;
  console.log(`Autonomous agent loop started (interval: ${ms}ms)`);
  intervalHandle = setInterval(() => {
    if (tickRunning) return; // skip if previous tick still running
    void runEvaluationTick();
  }, ms);
}

export function stopAutonomousAgentLoop(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("Autonomous agent loop stopped");
  }
}

async function runEvaluationTick(): Promise<void> {
  tickRunning = true;
  try {
    const rows = await listAutonomousActiveSessions();
    for (const row of rows) {
      try {
        await evaluateAgent(row.session, row.agent);
      } catch (err) {
        console.error(`Autonomous eval error for session ${row.session.id}:`, err);
      }
    }
  } catch (err) {
    console.error("Autonomous tick error:", err);
  } finally {
    tickRunning = false;
  }
}

async function evaluateAgent(
  session: {
    id: string;
    meeting_id: string;
    agent_id: string;
    last_auto_eval_segment_id: string | null;
    invoked_by_user_id: string;
  },
  agent: {
    id: string;
    name: string;
    system_prompt: string;
    intervention_style: string;
    default_provider: string;
    autonomous_cooldown_sec: number;
  }
): Promise<void> {
  // Stage 1a: Check for new finalized segments
  const newSegments = await listFinalSegmentsAfter(
    session.meeting_id,
    session.last_auto_eval_segment_id
  );

  if (newSegments.length < MIN_NEW_SEGMENTS) {
    return;
  }

  // Stage 1b: Cooldown check
  const lastAutoTime = await getLastAutonomousEventTime(session.meeting_id, agent.id);
  if (lastAutoTime) {
    const elapsed = (Date.now() - lastAutoTime.getTime()) / 1000;
    if (elapsed < agent.autonomous_cooldown_sec) {
      return;
    }
  }

  // Update cursor regardless of decision outcome
  const latestSegmentId = newSegments[newSegments.length - 1]?.id ?? "";
  await updateSessionEvalCursor(session.id, latestSegmentId);

  // Stage 2: LLM decision
  const recentLines = newSegments.map(
    (seg) =>
      `<transcript_line>${escapeXmlTags(`${seg.speaker_label}: ${seg.content}`)}</transcript_line>`
  );

  const decision = await callDecisionLlm(agent, recentLines);
  if (!decision.shouldIntervene) {
    return;
  }

  // Intervene using the existing pipeline
  await generateMeetingAgentResponse({
    meetingId: session.meeting_id,
    agentId: agent.id,
    prompt: decision.suggestedPrompt,
    triggeredByUserId: session.invoked_by_user_id,
    triggerMode: "autonomous",
  });
}

async function callDecisionLlm(
  agent: {
    name: string;
    system_prompt: string;
    intervention_style: string;
    default_provider: string;
  },
  recentTranscriptLines: string[]
): Promise<{ shouldIntervene: boolean; reason: string; suggestedPrompt: string }> {
  const result = await initLlmWithSettings({
    temperature: 0,
    maxTokens: 200,
    defaultProvider: agent.default_provider,
  });

  if (!result) {
    return { shouldIntervene: false, reason: "LLM not configured", suggestedPrompt: "" };
  }

  try {
    const chatModel = result.model;

    const prompt = buildAutonomousDecisionPrompt({
      agentName: escapeXmlTags(agent.name),
      interventionStyle: escapeXmlTags(agent.intervention_style),
      systemPrompt: escapeXmlTags(agent.system_prompt),
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
