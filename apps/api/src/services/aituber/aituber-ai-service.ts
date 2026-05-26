import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import {
  AITUBER_VALID_EMOTIONS,
  type AituberCitation,
  type AituberDataEvent,
  type AituberEmotionType,
  type UserRole,
} from "@echolore/shared/contracts";
import {
  AIMessage,
  type AIMessageChunk,
  type BaseMessage,
  HumanMessage,
} from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { createAituberAgent } from "../../ai/agent/create-aituber-agent.js";
import { defaultLlmProvider, type LlmProvider } from "../../ai/providers/index.js";
import { escapeXmlTags } from "../../ai/sanitize-prompt-input.js";
import {
  type AiChatToolResult,
  createAiChatListPagesTool,
  createAiChatReadPageTool,
  createAiChatSearchTool,
} from "../../ai/tools/ai-chat-tools.js";
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
    const { text: rawResponse, citations } = await generateStreamingResponse(
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

    // Send completion event with cleaned text and the sources we drew on.
    const assistantMsgId = crypto.randomUUID();
    await sendDataEvent(roomName, {
      type: "ai-complete",
      messageId: assistantMsgId,
      fullContent: responseText,
      citations,
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

interface GenerateResult {
  text: string;
  citations: AituberCitation[];
}

async function generateStreamingResponse(
  sessionId: string,
  character: AituberCharacter,
  viewerMessage: AituberMessage,
  viewerUser: SessionUser | null,
  roomName: string
): Promise<GenerateResult> {
  const result = await llm.init({ temperature: 0.7, maxTokens: 500, feature: "aituber" });
  if (!result) {
    return { text: "", citations: [] };
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

  // Viewer-scoped Wiki tools — the agent can deepen the search itself if the
  // pre-fetched RAG context isn't enough. Each tool checks `canReadPage(viewer, ...)`
  // so an unresolved viewer must NOT receive any tools.
  const tools: DynamicStructuredTool[] = [];
  const toolRefs: AiChatToolResult[] = [];
  if (viewerUser) {
    const { searchTool, referencedPages: searchRefs } = createAiChatSearchTool(viewerUser);
    const { listPagesTool, referencedPages: listRefs } = createAiChatListPagesTool(viewerUser);
    const { readPageTool, referencedPages: readRefs } = createAiChatReadPageTool(viewerUser);
    tools.push(searchTool, listPagesTool, readPageTool);
    // refs are populated as side effects when the agent calls a tool.
    toolRefs.push(...searchRefs, ...listRefs, ...readRefs);
  }

  const agent = createAituberAgent({
    chatModel,
    tools,
    ragContext: ragContext.text,
    character: {
      name: character.name,
      personality: character.personality,
      systemPrompt: character.systemPrompt,
      speakingStyle: character.speakingStyle,
    },
    // motion-registry (PR-C) drives the listing; falls back to "" when the
    // manifest hasn't loaded — action tags are then suppressed by the prompt.
    actionListing: motion?.promptListing ?? "",
  });

  const history = await aituberService.listMessageHistory(sessionId, 20);
  const langchainMessages: BaseMessage[] = [
    ...history.map((msg) =>
      msg.role === "assistant"
        ? new AIMessage(msg.content)
        : new HumanMessage(`[${msg.senderName}] ${msg.content}`)
    ),
    new HumanMessage(`[${viewerMessage.senderName}] ${viewerMessage.content}`),
  ];

  const generateStart = Date.now();
  let fullResponse = "";

  // streamMode "messages" yields each LLM token as an AIMessageChunk plus
  // metadata, so we can forward tokens to viewers in real time while still
  // letting the agent call tools mid-stream.
  const stream = await agent.stream({ messages: langchainMessages }, { streamMode: "messages" });

  // Track tools that have a started event in-flight so we can emit `finished`
  // exactly once when the corresponding ToolMessage comes back. Keyed by
  // tool_call id; falls back to a counter when the id isn't present.
  const inflightTools = new Map<string, string>();

  for await (const part of stream) {
    // Each yielded value is `[chunk, metadata]` for streamMode "messages".
    const chunk = Array.isArray(part) ? part[0] : (part as BaseMessage);
    if (!chunk) continue;
    const type = (chunk as BaseMessage)._getType?.();

    // ToolMessage = a tool just returned. Pair it with its inflight `started`
    // and emit `finished` so the viewer overlay can clear.
    if (type === "tool") {
      const toolMsg = chunk as { tool_call_id?: string; name?: string };
      const id = toolMsg.tool_call_id ?? "";
      const toolName = inflightTools.get(id) ?? toolMsg.name ?? "tool";
      inflightTools.delete(id);
      await sendDataEvent(roomName, { type: "tool-call", toolName, phase: "finished" });
      continue;
    }

    if (type !== "ai") continue;
    const aiChunk = chunk as AIMessageChunk;

    // Tool-call chunks: agent is deciding to invoke a tool. Forward a
    // `started` event with the tool name so the viewer sees feedback during
    // the search latency.
    if (aiChunk.tool_calls && aiChunk.tool_calls.length > 0) {
      for (const tc of aiChunk.tool_calls) {
        const toolName = tc.name ?? "tool";
        const id = tc.id ?? `__noid_${inflightTools.size}`;
        // De-dup: agent may yield the same tool_call across multiple chunks.
        if (!inflightTools.has(id)) {
          inflightTools.set(id, toolName);
          await sendDataEvent(roomName, { type: "tool-call", toolName, phase: "started" });
        }
      }
      continue;
    }
    if (aiChunk.tool_call_chunks && aiChunk.tool_call_chunks.length > 0) continue;

    // Plain text token — forward to the viewer.
    const token = typeof aiChunk.content === "string" ? aiChunk.content : "";
    if (token) {
      fullResponse += token;
      await sendDataEvent(roomName, { type: "ai-token", token });
    }
  }

  // Safety: if the stream ended mid-tool (shouldn't happen, but defends
  // against a hung tool), flush remaining `finished` events so the viewer UI
  // doesn't get stuck on "検索中…".
  for (const toolName of inflightTools.values()) {
    await sendDataEvent(roomName, { type: "tool-call", toolName, phase: "finished" });
  }

  // Combine pre-fetched RAG citations with anything the agent pulled in via
  // wiki_search / wiki_read_page / wiki_list_pages. Dedup by source+id.
  const seenKeys = new Set<string>();
  for (const c of ragContext.citations) {
    seenKeys.add(c.source === "wiki" ? `wiki:${c.pageId}` : `drive:${c.fileId}`);
  }
  const toolCitations: AituberCitation[] = [];
  for (const ref of toolRefs) {
    const key = `wiki:${ref.pageId}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    toolCitations.push({
      source: "wiki",
      pageId: ref.pageId,
      pageTitle: ref.pageTitle,
    });
  }
  const citations = [...ragContext.citations, ...toolCitations];

  console.log(
    JSON.stringify({
      event: "aituber-ai.generate",
      sessionId,
      viewerUserId: viewerUser?.id ?? null,
      hasRagContext: ragContext.text.length > 0,
      ragCitationCount: ragContext.citations.length,
      toolCitationCount: toolCitations.length,
      toolsAvailable: tools.length,
      responseChars: fullResponse.length,
      durationMs: Date.now() - generateStart,
    })
  );

  return { text: fullResponse, citations };
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
interface RagContext {
  /** Compact context string injected into the system prompt. */
  text: string;
  /** Sources referenced by the context; surfaced to viewers via ai-complete. */
  citations: AituberCitation[];
}

async function buildRagContext(
  sessionId: string,
  query: string,
  viewer: SessionUser | null
): Promise<RagContext> {
  if (!viewer) {
    console.log(
      JSON.stringify({
        event: "aituber-ai.search.skipped",
        sessionId,
        reason: "viewer_unresolved",
      })
    );
    return { text: "", citations: [] };
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
    const citations: AituberCitation[] = [];
    for (const r of wikiResults) {
      parts.push(
        `[Wiki: ${escapeXmlTags(r.pageTitle)}] ${escapeXmlTags(r.chunkText.slice(0, 300))}`
      );
      citations.push({
        source: "wiki",
        pageId: r.pageId,
        pageTitle: r.pageTitle,
        similarity: r.similarity,
      });
    }
    for (const r of driveResults) {
      parts.push(
        `[Drive: ${escapeXmlTags(r.fileName)}] ${escapeXmlTags(r.chunkText.slice(0, 300))}`
      );
      citations.push({
        source: "drive",
        fileId: r.fileId,
        fileName: r.fileName,
        webViewLink: r.webViewLink ?? null,
      });
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

    return { text: parts.length > 0 ? parts.join("\n") : "", citations };
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
    return { text: "", citations: [] };
  }
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
