import crypto from "node:crypto";
import type { AituberDataEvent } from "@echolore/shared/contracts";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { defaultLlmProvider, type LlmProvider } from "../../ai/providers/index.js";
import { escapeXmlTags } from "../../ai/sanitize-prompt-input.js";
import type { AituberCharacter, AituberMessage } from "../../db/schema.js";
import * as livekitService from "./aituber-livekit-service.js";
import * as aituberService from "./aituber-service.js";
import * as ttsService from "./aituber-tts-service.js";

// Replaceable for testing
let llm: LlmProvider = defaultLlmProvider;

/** @internal Override LLM provider (test-only) */
export function _setLlmProvider(p: LlmProvider) {
  llm = p;
}

// Active processing loops per session
const activeLoops = new Map<string, { running: boolean }>();

/**
 * Starts the AI processing loop for a session.
 * Polls for unprocessed messages and generates streaming responses.
 */
export async function startProcessingLoop(
  sessionId: string,
  character: AituberCharacter,
  roomName: string
): Promise<void> {
  if (activeLoops.has(sessionId)) return;

  const state = { running: true };
  activeLoops.set(sessionId, state);

  console.log(`[aituber-ai] Starting processing loop for session ${sessionId}`);

  // Run the loop in background
  void (async () => {
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 10;
    while (state.running) {
      try {
        await processNextMessage(sessionId, character, roomName);
        consecutiveErrors = 0;
      } catch (error) {
        consecutiveErrors++;
        console.error(
          `[aituber-ai] Error processing message for session ${sessionId} (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`,
          error
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(
            `[aituber-ai] Too many consecutive errors, stopping loop for session ${sessionId}`
          );
          state.running = false;
        }
      }
      // Poll interval
      await sleep(1000);
    }
    activeLoops.delete(sessionId);
    console.log(`[aituber-ai] Stopped processing loop for session ${sessionId}`);
  })();
}

/**
 * Stops the AI processing loop for a session.
 */
export function stopProcessingLoop(sessionId: string): void {
  const state = activeLoops.get(sessionId);
  if (state) {
    state.running = false;
    activeLoops.delete(sessionId);
  }
}

async function processNextMessage(
  sessionId: string,
  character: AituberCharacter,
  roomName: string
): Promise<void> {
  const messages = await aituberService.listUnprocessedMessages(sessionId);
  if (messages.length === 0) return;

  const viewerMessage = messages[0];
  if (!viewerMessage) return;

  // Mark as processing
  await aituberService.markMessageProcessed(viewerMessage.id);

  // Send thinking state
  await sendDataEvent(roomName, { type: "avatar-state", state: "thinking" });

  try {
    // Build context and generate response
    const rawResponse = await generateStreamingResponse(
      sessionId,
      character,
      viewerMessage,
      roomName
    );

    // Skip saving and broadcasting when LLM is not configured (empty response)
    if (!rawResponse) {
      console.warn(`[aituber-ai] LLM returned empty response for session ${sessionId}, skipping`);
      await sendDataEvent(roomName, { type: "avatar-state", state: "idle" });
      return;
    }

    // Parse emotion and action annotations from LLM response
    const { text: responseText, emotion, action } = parseAnnotations(rawResponse);

    // Send emotion event
    if (emotion) {
      await sendDataEvent(roomName, {
        type: "emotion",
        emotion: emotion.type,
        intensity: emotion.intensity,
      });
    }

    // Send action event
    if (action) {
      await sendDataEvent(roomName, { type: "action", action });
    }

    // Send completion event with cleaned text (no annotation tags)
    const assistantMsgId = crypto.randomUUID();
    await sendDataEvent(roomName, {
      type: "ai-complete",
      messageId: assistantMsgId,
      fullContent: responseText,
    });

    // Save assistant message to DB
    await aituberService.saveAssistantMessage({
      sessionId,
      content: responseText,
      characterName: character.name,
    });

    // TTS synthesis and avatar state
    await sendDataEvent(roomName, { type: "avatar-state", state: "talking" });
    try {
      const sentences = ttsService.splitIntoSentences(responseText);
      for (const sentence of sentences) {
        const ttsResult = await ttsService.synthesizeSpeech(
          sentence,
          character.languageCode,
          character.voiceName
        );
        // Send audio + visemes via data channel for client-side playback and lip sync
        await livekitService.sendDataToRoom(roomName, {
          type: "tts-audio",
          audio: ttsResult.audio.toString("base64"),
          mimeType: ttsResult.mimeType,
          visemes: ttsResult.visemes,
        });
      }
    } catch (ttsError) {
      console.error(`[aituber-ai] TTS error for session ${sessionId}:`, ttsError);
    }

    // Back to idle
    await sendDataEvent(roomName, { type: "avatar-state", state: "idle" });
  } catch (error) {
    // Reset to idle on error
    await sendDataEvent(roomName, { type: "avatar-state", state: "idle" });
    throw error;
  }
}

async function generateStreamingResponse(
  sessionId: string,
  character: AituberCharacter,
  viewerMessage: AituberMessage,
  roomName: string
): Promise<string> {
  const result = await llm.init({ temperature: 0.7, maxTokens: 500 });
  if (!result) {
    return "";
  }
  const chatModel = result.model;

  // Build messages with context
  const history = await aituberService.listMessageHistory(sessionId, 20);
  const langchainMessages = [
    new SystemMessage(buildSystemPrompt(character)),
    ...history.map((msg) =>
      msg.role === "assistant"
        ? new AIMessage(msg.content)
        : new HumanMessage(`[${msg.senderName}] ${msg.content}`)
    ),
    new HumanMessage(`[${viewerMessage.senderName}] ${viewerMessage.content}`),
  ];

  // Stream tokens
  let fullResponse = "";
  const stream = await chatModel.stream(langchainMessages);

  for await (const chunk of stream) {
    const token = typeof chunk.content === "string" ? chunk.content : "";
    if (token) {
      fullResponse += token;
      await sendDataEvent(roomName, { type: "ai-token", token });
    }
  }

  return fullResponse;
}

function buildSystemPrompt(character: AituberCharacter): string {
  let prompt = character.systemPrompt;
  prompt += `\n\nキャラクター名: ${escapeXmlTags(character.name)}`;
  prompt += `\n性格: ${escapeXmlTags(character.personality)}`;
  if (character.speakingStyle) {
    prompt += `\n話し方: ${escapeXmlTags(character.speakingStyle)}`;
  }
  prompt += "\n\n視聴者からのメッセージに対して、キャラクターとして自然に応答してください。";
  prompt += "\n応答は簡潔にし、1-3文程度で返してください。";

  // Emotion annotation
  prompt += "\n\n【重要】応答の先頭に必ず [emotion:TYPE:INTENSITY] を付与してください。";
  prompt += "\nTYPE: neutral, happy, sad, angry, surprised, relaxed のいずれか";
  prompt += "\nINTENSITY: 0.0〜1.0 の小数（感情の強さ）";

  // Action annotation — dynamically generated from action registry
  prompt +=
    "\n\n応答にジェスチャーが自然な場合、emotionタグの後に [action:ACTION_ID] を付与してください。";
  prompt += "\n以下のモーションから最適なものを選んでください:";
  for (const [category, actions] of Object.entries(ACTION_REGISTRY)) {
    const ids = actions.map((a) => a.id).join(", ");
    prompt += `\n${category}: ${ids}`;
  }
  prompt +=
    "\nアクションが不要な場合はタグを省略。同じアクションが連続しないようバリエーションを使い分けて。";

  prompt += "\n\n例: [emotion:happy:0.7][action:greeting-wave-casual] やっほー！元気？";
  prompt += "\n例: [emotion:neutral:0.0][action:nod-gentle-1] うん、そうだね。";
  prompt += "\n例: [emotion:sad:0.4] それは残念だね...";

  return prompt;
}

async function sendDataEvent(
  roomName: string,
  event: AituberDataEvent | Record<string, unknown>
): Promise<void> {
  await livekitService.sendDataToRoom(roomName, event);
}

// --- Action Registry ---
// Defines valid motion clip IDs grouped by category.
// Must be kept in sync with public/motions/manifest.json.

interface ActionDef {
  id: string;
  description: string;
}

const ACTION_REGISTRY: Record<string, ActionDef[]> = {
  greeting: [
    { id: "greeting-bow-polite", description: "Polite bow" },
    { id: "greeting-bow-casual", description: "Casual nod-bow" },
    { id: "greeting-bow-deep", description: "Deep formal bow" },
    { id: "greeting-wave-big", description: "Enthusiastic wave" },
    { id: "greeting-wave-casual", description: "Casual wave" },
    { id: "greeting-hand-raise", description: "Hand raise hello" },
    { id: "farewell-wave", description: "Goodbye wave" },
    { id: "farewell-bow", description: "Parting bow" },
  ],
  nod: [
    { id: "nod-gentle-1", description: "Gentle nod" },
    { id: "nod-gentle-2", description: "Nod with tilt" },
    { id: "nod-deep", description: "Deep emphatic nod" },
    { id: "nod-continuous", description: "Rapid triple nod" },
    { id: "nod-with-tilt", description: "Thoughtful nod" },
    { id: "nod-slow", description: "Slow deliberate nod" },
    { id: "head-tilt-curious", description: "Curious head tilt" },
    { id: "head-shake-gentle", description: "Gentle head shake" },
  ],
  laugh: [
    { id: "laugh-low", description: "Barely visible amusement" },
    { id: "laugh-low-mid", description: "Soft chuckle" },
    { id: "laugh-mid", description: "Natural laugh" },
    { id: "laugh-mid-high", description: "Hearty laugh" },
    { id: "laugh-high", description: "Full burst laugh" },
    { id: "laugh-shy", description: "Shy laugh" },
    { id: "laugh-wry", description: "Wry half-laugh" },
    { id: "laugh-stifled", description: "Stifled laugh" },
  ],
  surprise: [
    { id: "surprise-low", description: "Subtle double-take" },
    { id: "surprise-low-mid", description: "Mild lean back" },
    { id: "surprise-mid", description: "Clear surprise" },
    { id: "surprise-mid-high", description: "Visible shock" },
    { id: "surprise-high", description: "Dramatic shock recoil" },
  ],
  sad: [
    { id: "sad-low", description: "Slight posture sink" },
    { id: "sad-low-mid", description: "Quiet disappointment" },
    { id: "sad-mid", description: "Slumped dejection" },
    { id: "sad-mid-high", description: "Heavy drooping sadness" },
    { id: "sad-high", description: "Overwhelmed face cover" },
    { id: "sad-sigh", description: "Deep sigh" },
    { id: "sad-look-away", description: "Turn away withdrawing" },
  ],
  angry: [
    { id: "angry-low", description: "Contained irritation" },
    { id: "angry-low-mid", description: "Mild displeasure arms cross" },
    { id: "angry-mid", description: "Fist clench frustration" },
    { id: "angry-mid-high", description: "Aggressive lean forward" },
    { id: "angry-high", description: "Furious fist slam" },
    { id: "angry-sigh", description: "Exasperated sigh" },
    { id: "angry-arms-crossed", description: "Defiant arms crossed" },
  ],
  think: [
    { id: "think-chin-hand", description: "Chin on hand" },
    { id: "think-arms-crossed", description: "Arms crossed thinking" },
    { id: "think-head-scratch", description: "Head scratch puzzled" },
    { id: "think-look-up", description: "Look up searching" },
    { id: "think-fidget", description: "Chin tap mulling" },
  ],
  explain: [
    { id: "explain-hands-forward", description: "Palms up explaining" },
    { id: "explain-point", description: "Point for emphasis" },
    { id: "explain-hands-spread", description: "Hands spread wide" },
    { id: "explain-count-fingers", description: "Count on fingers" },
    { id: "explain-hands-together", description: "Hands together organizing" },
    { id: "explain-one-hand-wave", description: "One hand casual gesture" },
  ],
  reaction: [
    { id: "react-impressed", description: "Impressed slow nod" },
    { id: "react-confused", description: "Confused questioning" },
    { id: "react-embarrassed", description: "Embarrassed neck touch" },
    { id: "react-relieved", description: "Relieved exhale" },
    { id: "react-excited", description: "Excited fist pump" },
    { id: "react-sympathetic", description: "Sympathetic hand on heart" },
    { id: "react-grateful", description: "Grateful hands together" },
    { id: "react-determined", description: "Determined fist clench" },
  ],
  idle: [
    { id: "idle-shift-1", description: "Weight shift" },
    { id: "idle-shift-2", description: "Relaxed sway" },
    { id: "idle-stretch", description: "Light stretch" },
    { id: "idle-look-around", description: "Look around" },
    { id: "idle-hair-touch", description: "Hair touch fidget" },
    { id: "idle-arms-adjust", description: "Arms adjust" },
    { id: "idle-shoulder-roll", description: "Shoulder roll" },
  ],
};

// Flat set of all valid action IDs for validation
const VALID_ACTION_IDS = new Set(
  Object.values(ACTION_REGISTRY)
    .flat()
    .map((a) => a.id)
);

// --- Annotation Parsing ---

const EMOTION_TAG_RE = /^\[emotion:(\w+):([\d.]+)\]\s*/;
const ACTION_TAG_RE = /^\[action:([\w-]+)\]\s*/;

const VALID_EMOTIONS = ["neutral", "happy", "sad", "angry", "surprised", "relaxed"];

interface ParsedAnnotations {
  text: string;
  emotion: { type: string; intensity: number } | null;
  action: string | null;
}

export function parseAnnotations(rawText: string): ParsedAnnotations {
  let text = rawText;

  // Parse emotion tag at beginning
  let emotion: { type: string; intensity: number } | null = null;
  const emotionMatch = text.match(EMOTION_TAG_RE);
  if (emotionMatch) {
    const type = emotionMatch[1] ?? "";
    const intensity = Math.min(Math.max(Number.parseFloat(emotionMatch[2] ?? "0"), 0), 1);
    if (VALID_EMOTIONS.includes(type)) {
      emotion = { type, intensity };
    }
    text = text.slice(emotionMatch[0].length);
  }

  // Parse action tag — only accept IDs registered in ACTION_REGISTRY
  let action: string | null = null;
  const actionMatch = text.match(ACTION_TAG_RE);
  if (actionMatch) {
    const actionId = actionMatch[1] ?? "";
    if (VALID_ACTION_IDS.has(actionId)) {
      action = actionId;
    }
    text = text.slice(actionMatch[0].length);
  }

  // Strip any remaining annotation tags at the beginning that LLM may have duplicated
  while (/^\[emotion:\w+:[\d.]+\]\s*/.test(text)) {
    text = text.replace(/^\[emotion:\w+:[\d.]+\]\s*/, "");
  }
  while (/^\[action:[\w-]+\]\s*/.test(text)) {
    text = text.replace(/^\[action:[\w-]+\]\s*/, "");
  }

  return { text: text.trim(), emotion, action };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
