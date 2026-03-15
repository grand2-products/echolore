import crypto from "node:crypto";
import type { AituberDataEvent } from "@echolore/shared/contracts";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createChatModel, resolveTextProvider } from "../../ai/llm/create-chat-model.js";
import type { AituberCharacter, AituberMessage } from "../../db/schema.js";
import { getLlmSettings } from "../admin/llm-settings-service.js";
import * as livekitService from "./aituber-livekit-service.js";
import * as aituberService from "./aituber-service.js";
import * as ttsService from "./aituber-tts-service.js";

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
    while (state.running) {
      try {
        await processNextMessage(sessionId, character, roomName);
      } catch (error) {
        console.error(`[aituber-ai] Error processing message for session ${sessionId}:`, error);
      }
      // Poll interval
      await sleep(1000);
    }
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
  const messages = await aituberService.getUnprocessedMessages(sessionId);
  if (messages.length === 0) return;

  const viewerMessage = messages[0];
  if (!viewerMessage) return;

  // Mark as processing
  await aituberService.markMessageProcessed(viewerMessage.id);

  // Send thinking state
  await sendDataEvent(roomName, { type: "avatar-state", state: "thinking" });

  try {
    // Build context and generate response
    const responseText = await generateStreamingResponse(
      sessionId,
      character,
      viewerMessage,
      roomName
    );

    // Send completion event
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
        // Send audio as base64 via data channel for client-side playback
        await livekitService.sendDataToRoom(roomName, {
          type: "tts-audio",
          audio: ttsResult.audio.toString("base64"),
          mimeType: ttsResult.mimeType,
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
  const dbSettings = await getLlmSettings();
  const provider = resolveTextProvider(dbSettings.provider);
  const chatModel = createChatModel({
    provider,
    temperature: 0.7,
    maxTokens: 500,
    overrides: {
      geminiApiKey: dbSettings.geminiApiKey,
      geminiTextModel: dbSettings.geminiTextModel,
      vertexProject: dbSettings.vertexProject,
      vertexLocation: dbSettings.vertexLocation,
      vertexModel: dbSettings.vertexModel,
      zhipuApiKey: dbSettings.zhipuApiKey,
      zhipuTextModel: dbSettings.zhipuTextModel,
    },
  });

  // Build messages with context
  const history = await aituberService.getMessageHistory(sessionId, 20);
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
  prompt += `\n\nキャラクター名: ${character.name}`;
  prompt += `\n性格: ${character.personality}`;
  if (character.speakingStyle) {
    prompt += `\n話し方: ${character.speakingStyle}`;
  }
  prompt += "\n\n視聴者からのメッセージに対して、キャラクターとして自然に応答してください。";
  prompt += "\n応答は簡潔にし、1-3文程度で返してください。";
  return prompt;
}

async function sendDataEvent(
  roomName: string,
  event: AituberDataEvent | Record<string, unknown>
): Promise<void> {
  await livekitService.sendDataToRoom(roomName, event);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
