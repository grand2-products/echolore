import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import {
  AITUBER_VALID_EMOTIONS,
  type AituberDataEvent,
  type AituberEmotionType,
  type UserRole,
} from "@echolore/shared/contracts";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { defaultLlmProvider, type LlmProvider } from "../../ai/providers/index.js";
import { escapeXmlTags } from "../../ai/sanitize-prompt-input.js";
import type { AituberCharacter, AituberMessage } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import { getUserById } from "../../repositories/user/user-repository.js";
import { searchDriveForUser } from "../drive/drive-vector-search-service.js";
import { searchVisibleChunks } from "../wiki/vector-search-service.js";
import * as livekitService from "./aituber-livekit-service.js";
import * as aituberService from "./aituber-service.js";
import * as ttsService from "./aituber-tts-service.js";
import { getValidActionIdsSync, loadMotionRegistry } from "./motion-registry.js";

// Replaceable for testing
let llm: LlmProvider = defaultLlmProvider;

/** @internal Override LLM provider (test-only) */
export function _setLlmProvider(p: LlmProvider) {
  llm = p;
}

// Active processing workers per session.
// Each session has at most one worker; new viewer messages arrive via
// `notifyNewMessage(sessionId)` and the worker drains the queue then waits
// for the next notification (no polling).
interface SessionWorkerState {
  running: boolean;
  character: AituberCharacter;
  roomName: string;
}

const activeLoops = new Map<string, SessionWorkerState>();
const messageEvents = new EventEmitter();
messageEvents.setMaxListeners(0);

const SAFETY_TICK_MS = 60_000; // periodic re-check in case a notify was missed

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
 * RAG コンテキストは、メッセージを送った視聴者の SessionUser に解決した上で、
 * その視聴者の権限スコープで Wiki / Drive を検索する。視聴者が解決できない
 * 場合 (削除/停止/null) は RAG を完全にスキップし、admin 相当の検索には
 * フォールバックしない。
 */
export async function startProcessingLoop(
  sessionId: string,
  character: AituberCharacter,
  roomName: string
): Promise<void> {
  if (activeLoops.has(sessionId)) return;

  const state: SessionWorkerState = { running: true, character, roomName };
  activeLoops.set(sessionId, state);

  // Best-effort: load the motion manifest so action-tag validation is active
  // by the time the worker handles its first message.
  void loadMotionRegistry().catch((err) =>
    console.warn("[aituber-ai] Failed to load motion manifest:", err)
  );

  console.log(`[aituber-ai] Starting processing worker for session ${sessionId}`);

  void runWorker(sessionId, state);
}

async function runWorker(sessionId: string, state: SessionWorkerState): Promise<void> {
  const channel = `message:${sessionId}`;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;
  let aborted = false;

  // Drain any messages already queued before the worker started.
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
 */
async function tearDownAbortedSession(sessionId: string, roomName: string): Promise<void> {
  // Notify viewers before we tear down the room.
  await sendDataEvent(roomName, { type: "session-aborted" }).catch((err) =>
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

/**
 * Processes a single unprocessed viewer message for the session, if one
 * exists. Returns `true` when a message was processed, `false` when the queue
 * was empty (so the caller knows to wait for a notification).
 */
async function processNextMessage(
  sessionId: string,
  character: AituberCharacter,
  roomName: string
): Promise<boolean> {
  const messages = await aituberService.listUnprocessedMessages(sessionId);
  if (messages.length === 0) return false;

  const viewerMessage = messages[0];
  if (!viewerMessage) return false;

  // Mark as processing
  await aituberService.markMessageProcessed(viewerMessage.id);

  // Resolve the viewer's SessionUser so RAG searches inherit their permission scope.
  // Falling back to a no-RAG path is safer than running an admin-scoped search.
  const viewerUser = await resolveViewerUser(viewerMessage.senderUserId);

  // Send thinking state
  await sendDataEvent(roomName, { type: "avatar-state", state: "thinking" });

  try {
    // Build context and generate response
    const rawResponse = await generateStreamingResponse(
      sessionId,
      character,
      viewerMessage,
      viewerUser,
      roomName
    );

    // Skip saving and broadcasting when LLM is not configured (empty response)
    if (!rawResponse) {
      console.warn(`[aituber-ai] LLM returned empty response for session ${sessionId}, skipping`);
      await sendDataEvent(roomName, { type: "avatar-state", state: "idle" });
      return true;
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
    return true;
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
  viewerUser: SessionUser | null,
  roomName: string
): Promise<string> {
  const result = await llm.init({ temperature: 0.7, maxTokens: 500, feature: "aituber" });
  if (!result) {
    return "";
  }
  const chatModel = result.model;

  // RAG: search Wiki + Drive in parallel, **scoped to the viewer's permissions**.
  // If the viewer can't be resolved, RAG is skipped entirely.
  // Motion manifest is loaded in parallel so the system prompt can advertise
  // the current set of action IDs (kept in sync with public/motions/manifest.json).
  const [ragContext, motion] = await Promise.all([
    buildRagContext(sessionId, viewerMessage.content, viewerUser),
    loadMotionRegistry().catch(() => null),
  ]);

  // Build messages with context
  const history = await aituberService.listMessageHistory(sessionId, 20);
  const langchainMessages = [
    new SystemMessage(buildSystemPrompt(character, ragContext, motion?.promptListing ?? "")),
    ...history.map((msg) =>
      msg.role === "assistant"
        ? new AIMessage(msg.content)
        : new HumanMessage(`[${msg.senderName}] ${msg.content}`)
    ),
    new HumanMessage(`[${viewerMessage.senderName}] ${viewerMessage.content}`),
  ];

  const generateStart = Date.now();

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

  console.log(
    JSON.stringify({
      event: "aituber-ai.generate",
      sessionId,
      viewerUserId: viewerUser?.id ?? null,
      hasRagContext: ragContext.length > 0,
      responseChars: fullResponse.length,
      durationMs: Date.now() - generateStart,
    })
  );

  return fullResponse;
}

/**
 * Resolve the viewer's SessionUser from a viewer-message senderUserId.
 *
 * Returns null when:
 *   - senderUserId is null (the message came from a non-authenticated path,
 *     which shouldn't happen via /sessions/:id/messages but is defended anyway), or
 *   - the user has been deleted/suspended since posting.
 *
 * A null return causes RAG to be skipped — never fall back to admin-scoped search.
 */
async function resolveViewerUser(senderUserId: string | null): Promise<SessionUser | null> {
  if (!senderUserId) return null;
  const user = await getUserById(senderUserId).catch(() => null);
  if (!user) return null;
  if (user.deletedAt || user.suspendedAt) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    avatarUrl: user.avatarUrl ?? null,
  };
}

/**
 * Search Wiki + Drive in parallel and build a compact RAG context string,
 * scoped to the viewer's permissions. Returns empty string when the viewer
 * cannot be resolved or when both searches return nothing.
 *
 * ## 権限モデル
 * 視聴者が認証済みであっても、その視聴者が read 権限を持たない Wiki ページや
 * Drive ファイルの内容が AI の応答経由で漏出してはならない。そのため、
 *   - Wiki: searchVisibleChunks(viewer, ...) — viewer の SessionUser でフィルタ
 *   - Drive: searchDriveForUser(viewer.email, ...) — viewer のメールでフィルタ
 * を使う。Wiki Chat 経路と同じ権限境界。
 */
async function buildRagContext(
  sessionId: string,
  query: string,
  viewer: SessionUser | null
): Promise<string> {
  if (!viewer) {
    console.log(
      JSON.stringify({
        event: "aituber-ai.search.skipped",
        sessionId,
        reason: "viewer_unresolved",
      })
    );
    return "";
  }

  const searchStart = Date.now();
  try {
    const [wikiOutcome, driveResults] = await Promise.all([
      searchVisibleChunks(viewer, query, 3).catch((err) => {
        console.warn(
          JSON.stringify({
            event: "aituber-ai.search.wiki-error",
            sessionId,
            viewerUserId: viewer.id,
            error: err instanceof Error ? err.message : String(err),
          })
        );
        return { results: [], searchMode: "ilike_fallback" as const };
      }),
      searchDriveForUser(viewer.email, query, 2).catch((err) => {
        console.warn(
          JSON.stringify({
            event: "aituber-ai.search.drive-error",
            sessionId,
            viewerUserId: viewer.id,
            error: err instanceof Error ? err.message : String(err),
          })
        );
        return [] as Awaited<ReturnType<typeof searchDriveForUser>>;
      }),
    ]);

    const wikiResults = wikiOutcome.results;
    const parts: string[] = [];
    for (const r of wikiResults) {
      parts.push(
        `[Wiki: ${escapeXmlTags(r.pageTitle)}] ${escapeXmlTags(r.chunkText.slice(0, 300))}`
      );
    }
    for (const r of driveResults) {
      parts.push(
        `[Drive: ${escapeXmlTags(r.fileName)}] ${escapeXmlTags(r.chunkText.slice(0, 300))}`
      );
    }

    console.log(
      JSON.stringify({
        event: "aituber-ai.search",
        sessionId,
        viewerUserId: viewer.id,
        wikiResultCount: wikiResults.length,
        driveResultCount: driveResults.length,
        topWikiSimilarity: wikiResults[0]?.similarity ?? null,
        searchMode: wikiOutcome.searchMode,
        durationMs: Date.now() - searchStart,
      })
    );

    return parts.length > 0 ? parts.join("\n") : "";
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "aituber-ai.search.error",
        sessionId,
        viewerUserId: viewer.id,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - searchStart,
      })
    );
    return "";
  }
}

function buildSystemPrompt(
  character: AituberCharacter,
  ragContext = "",
  actionListing = ""
): string {
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

  // Action annotation — only advertised when the motion manifest is loaded.
  if (actionListing) {
    prompt +=
      "\n\n応答にジェスチャーが自然な場合、emotionタグの後に [action:ACTION_ID] を付与してください。";
    prompt += "\n以下のモーションから最適なものを選んでください:";
    prompt += `\n${actionListing}`;
    prompt +=
      "\nアクションが不要な場合はタグを省略。同じアクションが連続しないようバリエーションを使い分けて。";

    prompt += "\n\n例: [emotion:happy:0.7][action:greeting-wave-casual] やっほー！元気？";
    prompt += "\n例: [emotion:neutral:0.0][action:nod-gentle-1] うん、そうだね。";
    prompt += "\n例: [emotion:sad:0.4] それは残念だね...";
  }

  // RAG context — reference material from Wiki and Drive
  if (ragContext) {
    prompt += "\n\n## 参考情報（社内Wiki・共有ドライブ）";
    prompt += "\n以下の情報を参考にして回答できますが、キャラクターの口調は崩さないでください。";
    prompt += `\n${ragContext}`;
  }

  return prompt;
}

async function sendDataEvent(
  roomName: string,
  event: AituberDataEvent | Record<string, unknown>
): Promise<void> {
  await livekitService.sendDataToRoom(roomName, event);
}

// --- Annotation Parsing ---
// Action IDs and prompt listing are now loaded from
// `public/motions/manifest.json` via `motion-registry.ts`. See #55.

const EMOTION_TAG_RE = /^\[emotion:(\w+):([\d.]+)\]\s*/;
const ACTION_TAG_RE = /^\[action:([\w-]+)\]\s*/;

const VALID_EMOTIONS: readonly AituberEmotionType[] = AITUBER_VALID_EMOTIONS;

function isAituberEmotionType(value: string): value is AituberEmotionType {
  return (VALID_EMOTIONS as readonly string[]).includes(value);
}

interface ParsedAnnotations {
  text: string;
  emotion: { type: AituberEmotionType; intensity: number } | null;
  action: string | null;
}

export function parseAnnotations(rawText: string): ParsedAnnotations {
  let text = rawText;

  // Parse emotion tag at beginning
  let emotion: { type: AituberEmotionType; intensity: number } | null = null;
  const emotionMatch = text.match(EMOTION_TAG_RE);
  if (emotionMatch) {
    const type = emotionMatch[1] ?? "";
    const intensity = Math.min(Math.max(Number.parseFloat(emotionMatch[2] ?? "0"), 0), 1);
    if (isAituberEmotionType(type)) {
      emotion = { type, intensity };
    }
    text = text.slice(emotionMatch[0].length);
  }

  // Parse action tag — only accept IDs known to the loaded motion manifest.
  // If the manifest hasn't been preloaded yet (or the file is missing) the
  // action is dropped so we never broadcast an unknown clip ID to the client.
  let action: string | null = null;
  const actionMatch = text.match(ACTION_TAG_RE);
  if (actionMatch) {
    const actionId = actionMatch[1] ?? "";
    const validIds = getValidActionIdsSync();
    if (validIds?.has(actionId)) {
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
