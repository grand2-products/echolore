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
  isPublic?: boolean;
  createdBy: string;
}): Promise<AituberCharacter> {
  return createOrThrow(
    () =>
      repo.createCharacter({
        id: crypto.randomUUID(),
        name: input.name,
        personality: input.personality,
        systemPrompt: input.systemPrompt,
        speakingStyle: input.speakingStyle ?? null,
        languageCode: input.languageCode ?? "ja-JP",
        voiceName: input.voiceName ?? null,
        avatarUrl: input.avatarUrl ?? null,
        isPublic: input.isPublic ?? false,
        createdBy: input.createdBy,
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
    isPublic: boolean;
  }>
) {
  return repo.updateCharacter(id, { ...payload, updatedAt: new Date() });
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
        characterId: input.characterId,
        creatorId: input.creatorId,
        title: input.title,
        status: "created",
        roomName,
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
  const session = await repo.getSessionById(id);
  if (!session) throw new Error("Session not found");
  if (session.status !== "created") throw new Error("Session is not in created state");

  const updated = await repo.updateSession(id, {
    status: "live",
    startedAt: new Date(),
  });
  if (!updated) throw new Error("Failed to start session");
  return updated;
}

export async function stopSession(id: string): Promise<AituberSession> {
  const session = await repo.getSessionById(id);
  if (!session) throw new Error("Session not found");
  if (session.status !== "live") throw new Error("Session is not live");

  const updated = await repo.updateSession(id, {
    status: "ended",
    endedAt: new Date(),
  });
  if (!updated) throw new Error("Failed to stop session");
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
        sessionId: input.sessionId,
        role: "viewer",
        senderUserId: input.senderUserId ?? null,
        senderName: input.senderName,
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
        sessionId: input.sessionId,
        role: "assistant",
        senderUserId: null,
        senderName: input.characterName,
        content: input.content,
        processedAt: new Date(),
      }),
    "Failed to save assistant message"
  );
}

export async function getUnprocessedMessages(sessionId: string) {
  return repo.getUnprocessedMessages(sessionId);
}

export async function markMessageProcessed(id: string) {
  return repo.markMessageProcessed(id);
}

export async function getMessageHistory(sessionId: string, limit?: number) {
  return repo.getRecentMessages(sessionId, limit);
}

export async function listMessages(sessionId: string, limit?: number) {
  return repo.listMessagesBySession(sessionId, limit);
}
