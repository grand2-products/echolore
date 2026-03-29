import crypto from "node:crypto";
import { nanoid } from "nanoid";
import type { AituberCharacter, AituberMessage, AituberSession } from "../../db/schema.js";
import { createOrThrow } from "../../lib/db-utils.js";
import * as repo from "../../repositories/aituber/aituber-repository.js";

// --- Character Management ---

export async function createCharacter(input: {
  name: string;
  personality: string;
  systemPrompt: string;
  speakingStyle?: string;
  languageCode?: string;
  voiceName?: string;
  avatarUrl?: string;
  avatarFileId?: string;
  isPublic?: boolean;
  createdBy: string;
}): Promise<AituberCharacter> {
  return createOrThrow(
    () =>
      repo.createCharacter({
        id: crypto.randomUUID(),
        name: input.name,
        personality: input.personality,
        system_prompt: input.systemPrompt,
        speaking_style: input.speakingStyle ?? null,
        language_code: input.languageCode ?? "ja-JP",
        voice_name: input.voiceName ?? null,
        avatar_url: input.avatarUrl ?? null,
        avatar_file_id: input.avatarFileId ?? null,
        is_public: input.isPublic ?? false,
        created_by: input.createdBy,
      }),
    "Failed to create character"
  );
}

export async function getCharacter(id: string): Promise<AituberCharacter | null> {
  return repo.getCharacterById(id);
}

export async function listCharacters(opts?: { createdBy?: string }) {
  return repo.listCharacters(opts);
}

export async function updateCharacter(
  id: string,
  payload: Partial<{
    name: string;
    personality: string;
    systemPrompt: string;
    speakingStyle: string | null;
    languageCode: string;
    voiceName: string | null;
    avatarUrl: string | null;
    avatarFileId: string | null;
    isPublic: boolean;
  }>
): Promise<AituberCharacter> {
  const updated = await repo.updateCharacter(id, { ...payload, updatedAt: new Date() });
  if (!updated) {
    throw new Error("Character not found");
  }
  return updated;
}

export async function deleteCharacter(id: string) {
  return repo.deleteCharacter(id);
}

// --- Session Management ---

export async function createSession(input: {
  characterId: string;
  creatorId: string;
  title: string;
}): Promise<AituberSession> {
  const roomName = `aituber-${nanoid(12)}`;
  return createOrThrow(
    () =>
      repo.createSession({
        id: crypto.randomUUID(),
        character_id: input.characterId,
        creator_id: input.creatorId,
        title: input.title,
        status: "created",
        room_name: roomName,
      }),
    "Failed to create session"
  );
}

export async function getSession(id: string): Promise<AituberSession | null> {
  return repo.getSessionById(id);
}

export async function listSessions(opts?: { status?: string; creatorId?: string }) {
  return repo.listSessions(opts);
}

export async function startSession(id: string): Promise<AituberSession> {
  // Atomic status transition: only update if currently "created"
  const updated = await repo.updateSessionWithStatus(id, "created", {
    status: "live",
    startedAt: new Date(),
  });
  if (!updated) throw new Error("Session not found or not in created state");
  return updated;
}

export async function stopSession(id: string): Promise<AituberSession> {
  // Atomic status transition: only update if currently "live"
  const updated = await repo.updateSessionWithStatus(id, "live", {
    status: "ended",
    endedAt: new Date(),
  });
  if (!updated) throw new Error("Session not found or not live");
  return updated;
}

// --- Message Management ---

export async function sendViewerMessage(input: {
  sessionId: string;
  senderUserId?: string;
  senderName: string;
  content: string;
}): Promise<AituberMessage> {
  return createOrThrow(
    () =>
      repo.createMessage({
        id: crypto.randomUUID(),
        session_id: input.sessionId,
        role: "viewer",
        sender_user_id: input.senderUserId ?? null,
        sender_name: input.senderName,
        content: input.content,
      }),
    "Failed to send message"
  );
}

export async function saveAssistantMessage(input: {
  sessionId: string;
  content: string;
  characterName: string;
}): Promise<AituberMessage> {
  return createOrThrow(
    () =>
      repo.createMessage({
        id: crypto.randomUUID(),
        session_id: input.sessionId,
        role: "assistant",
        sender_user_id: null,
        sender_name: input.characterName,
        content: input.content,
        processed_at: new Date(),
      }),
    "Failed to save assistant message"
  );
}

export async function listUnprocessedMessages(sessionId: string) {
  return repo.listUnprocessedMessages(sessionId);
}

export async function markMessageProcessed(id: string) {
  return repo.markMessageProcessed(id);
}

export async function listMessageHistory(sessionId: string, limit?: number) {
  return repo.listRecentMessages(sessionId, limit);
}

export async function listMessages(sessionId: string, limit?: number) {
  return repo.listMessagesBySession(sessionId, limit);
}
