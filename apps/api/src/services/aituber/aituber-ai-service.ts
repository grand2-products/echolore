import crypto from "node:crypto";
import { type AituberCitation, UserRole } from "@echolore/shared/contracts";
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
  createAiChatDriveReadTool,
  createAiChatDriveSearchTool,
  type DriveToolResult,
} from "../../ai/tools/ai-chat-drive-tools.js";
import {
  type AiChatToolResult,
  createAiChatListPagesTool,
  createAiChatReadPageTool,
  createAiChatSearchTool,
} from "../../ai/tools/ai-chat-tools.js";
import {
  createMeetingTranscriptLookupTool,
  createRecentMeetingsTool,
} from "../../ai/tools/aituber-meeting-tools.js";
import type { AituberCharacter, AituberMessage } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import { getUserById } from "../../repositories/user/user-repository.js";
import { getResolvedDriveSettings } from "../admin/drive-settings-service.js";
import { parseAnnotations } from "./aituber-annotations.js";
import * as livekitService from "./aituber-livekit-service.js";
import { buildRagContext } from "./aituber-rag-context.js";
import * as aituberService from "./aituber-service.js";
import * as ttsService from "./aituber-tts-service.js";
import {
  notifyNewMessage,
  startProcessingLoop as startWorker,
  stopProcessingLoop,
} from "./aituber-worker.js";
import { loadMotionRegistry } from "./motion-registry.js";

/**
 * AITuber AI service — owns the *per-message* path:
 *
 *   resolve viewer → build RAG context → run ReAct agent → stream tokens →
 *   parse annotations → save assistant message → synthesize TTS
 *
 * The worker lifecycle (start / stop / event channel) lives in
 * `aituber-worker.ts`; annotation parsing in `aituber-annotations.ts`;
 * permission-scoped RAG search in `aituber-rag-context.ts`. We re-export
 * the public worker / annotation API here so existing callers
 * (routes + tests) don't have to change import paths.
 */

export { parseAnnotations } from "./aituber-annotations.js";
// Re-exports for callers that imported the old monolithic module.
export { notifyNewMessage, stopProcessingLoop };

const llm: LlmProvider = defaultLlmProvider;

/**
 * Public entry point for the route layer: spin up an event-driven processing
 * worker for the given session. The worker calls back into
 * `processNextMessage` for each viewer message.
 */
export function startProcessingLoop(
  sessionId: string,
  character: AituberCharacter,
  roomName: string
): void {
  startWorker(sessionId, character, roomName, processNextMessage);
}

/**
 * Processes a single unprocessed viewer message for the session, if one
 * exists. Returns `true` when a message was processed, `false` when the queue
 * was empty (so the worker knows to wait for a notification).
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

  // Viewer-scoped tools — the agent can deepen the search itself if the
  // pre-fetched RAG context isn't enough. Each tool checks `canReadPage(viewer, ...)`
  // / `searchDriveForUser(viewer.email, ...)` so an unresolved viewer must NOT
  // receive any tools.
  const tools: DynamicStructuredTool[] = [];
  const wikiToolRefs: AiChatToolResult[] = [];
  const driveToolRefs: DriveToolResult[] = [];
  if (viewerUser) {
    const { searchTool, referencedPages: searchRefs } = createAiChatSearchTool(viewerUser);
    const { listPagesTool, referencedPages: listRefs } = createAiChatListPagesTool(viewerUser);
    const { readPageTool, referencedPages: readRefs } = createAiChatReadPageTool(viewerUser);
    tools.push(searchTool, listPagesTool, readPageTool);
    wikiToolRefs.push(...searchRefs, ...listRefs, ...readRefs);

    // Drive tools are only added when Drive is enabled and has at least one
    // shared drive configured — matches the AI Chat guard.
    try {
      const driveSettings = await getResolvedDriveSettings();
      if (driveSettings.enabled && driveSettings.sharedDriveIds.length > 0) {
        const { driveSearchTool, referencedFiles: searchFiles } =
          createAiChatDriveSearchTool(viewerUser);
        const { driveReadTool, referencedFiles: readFiles } = createAiChatDriveReadTool(viewerUser);
        tools.push(driveSearchTool, driveReadTool);
        driveToolRefs.push(...searchFiles, ...readFiles);
      }
    } catch {
      // Drive not configured — continue without Drive tools.
    }

    // Meeting tools (#73): viewer-scoped lookup of the viewer's own recent
    // meetings + their transcripts. Permission is enforced per call inside the
    // tools (creator / admin only) so a transcript never leaks to the room.
    tools.push(createRecentMeetingsTool(viewerUser), createMeetingTranscriptLookupTool(viewerUser));

    // NOTE (review finding C5): `lookup_user` was previously added here, but
    // the /api/users route is admin-only — the employee directory is NOT open
    // to all authenticated users. Exposing it via AITuber meant viewers could
    // mint employee email / role queries that were then broadcast to every
    // participant in the room. Removed until a viewer-safe directory tool
    // exists (see issue tracker — follow-up).
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
    // Sanitize viewer-supplied content before handing it to the LLM. `senderName`
    // comes from the user's profile (OAuth-provider supplied) and `content` is
    // raw viewer chat — both must be escaped so a viewer can't inject `[system]`
    // /tag-shaped strings that the LLM might treat as instructions. Assistant
    // history comes from our own TTS path so escaping is unnecessary, but we
    // wrap it too for consistency. (M14)
    ...history.map((msg) =>
      msg.role === "assistant"
        ? new AIMessage(msg.content)
        : new HumanMessage(`[${escapeXmlTags(msg.senderName)}] ${escapeXmlTags(msg.content)}`)
    ),
    new HumanMessage(
      `[${escapeXmlTags(viewerMessage.senderName)}] ${escapeXmlTags(viewerMessage.content)}`
    ),
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
  // wiki_search / wiki_read_page / wiki_list_pages / drive_search / drive_read.
  // Dedup by source+id so a page that appears in both RAG and a tool call is
  // only cited once.
  const seenKeys = new Set<string>();
  for (const c of ragContext.citations) {
    seenKeys.add(c.source === "wiki" ? `wiki:${c.pageId}` : `drive:${c.fileId}`);
  }
  const toolCitations: AituberCitation[] = [];
  for (const ref of wikiToolRefs) {
    const key = `wiki:${ref.pageId}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    toolCitations.push({
      source: "wiki",
      pageId: ref.pageId,
      pageTitle: ref.pageTitle,
    });
  }
  for (const ref of driveToolRefs) {
    const key = `drive:${ref.driveFileId}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    toolCitations.push({
      source: "drive",
      fileId: ref.driveFileId,
      fileName: ref.driveFileName,
      webViewLink: ref.driveLink ?? null,
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
 *
 * ## H7: admin viewers are scope-downgraded to member
 *
 * AITuber responses are broadcast to **every viewer** on the LiveKit data
 * channel. If an admin happens to send a viewer message, processing that
 * message under their admin role would surface admin-only pages (or
 * unfiltered Drive results) to non-admin viewers. The admin's intent for
 * their own browsing scope shouldn't leak into the room broadcast.
 *
 * We downgrade `role` to `Member` here so all viewer messages are processed
 * with the *least privilege* available, regardless of who sent them. Admins
 * who genuinely need admin-scoped answers should use the AI Chat surface
 * (which is a 1:1 surface, not broadcast).
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
    role: UserRole.Member,
    avatarUrl: user.avatarUrl ?? null,
  };
}

async function sendDataEvent(roomName: string, event: Record<string, unknown>): Promise<void> {
  await livekitService.sendDataToRoom(roomName, event);
}
