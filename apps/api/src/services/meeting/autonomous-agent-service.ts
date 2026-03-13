import { HumanMessage } from "@langchain/core/messages";
import { buildAutonomousDecisionPrompt } from "../../ai/agent/autonomous-decision-prompt.js";
import { createChatModel, isTextGenerationEnabled, resolveTextProvider } from "../../ai/llm/index.js";
import type { LlmOverrides } from "../../ai/llm/index.js";
import { getLlmSettings } from "../admin/admin-service.js";
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
        console.error(
          `Autonomous eval error for session ${row.session.id}:`,
          err
        );
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
  const lastAutoTime = await getLastAutonomousEventTime(
    session.meetingId,
    agent.id
  );
  if (lastAutoTime) {
    const elapsed = (Date.now() - lastAutoTime.getTime()) / 1000;
    if (elapsed < agent.autonomousCooldownSec) {
      return;
    }
  }

  // Update cursor regardless of decision outcome
  const latestSegmentId = newSegments[newSegments.length - 1]!.id;
  await updateSessionEvalCursor(session.id, latestSegmentId);

  // Stage 2: LLM decision
  const recentLines = newSegments.map(
    (seg) => `${seg.speakerLabel}: ${seg.content}`
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
  const dbSettings = await getLlmSettings();
  const overrides: LlmOverrides = {
    geminiApiKey: dbSettings.geminiApiKey,
    geminiTextModel: dbSettings.geminiTextModel,
    vertexProject: dbSettings.vertexProject,
    vertexLocation: dbSettings.vertexLocation,
    vertexModel: dbSettings.vertexModel,
    zhipuApiKey: dbSettings.zhipuApiKey,
    zhipuTextModel: dbSettings.zhipuTextModel,
  };
  const provider = resolveTextProvider(
    agent.defaultProvider ?? dbSettings.provider
  );

  if (!isTextGenerationEnabled(provider, overrides)) {
    return { shouldIntervene: false, reason: "LLM not configured", suggestedPrompt: "" };
  }

  try {
    const chatModel = createChatModel({
      provider,
      temperature: 0,
      maxTokens: 200,
      overrides,
    });

    const prompt = buildAutonomousDecisionPrompt({
      agentName: agent.name,
      interventionStyle: agent.interventionStyle,
      systemPrompt: agent.systemPrompt,
      recentTranscriptLines,
    });

    const result = await chatModel.invoke([new HumanMessage(prompt)]);
    const text =
      typeof result.content === "string"
        ? result.content.trim()
        : String(result.content).trim();

    // Parse JSON response
    const parsed = JSON.parse(text) as {
      shouldIntervene: boolean;
      reason: string;
      suggestedPrompt: string;
    };

    return {
      shouldIntervene: Boolean(parsed.shouldIntervene),
      reason: parsed.reason ?? "",
      suggestedPrompt: parsed.suggestedPrompt ?? "",
    };
  } catch {
    return { shouldIntervene: false, reason: "Decision LLM call failed", suggestedPrompt: "" };
  }
}
