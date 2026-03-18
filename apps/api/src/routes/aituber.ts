import crypto from "node:crypto";
import { MAX_VRM_FILE_SIZE_BYTES, UserRole } from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { jsonError, withErrorHandler } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import { buildStoragePath, removeFile, saveFile } from "../lib/file-storage.js";
import { isOwnerOrAdmin } from "../lib/route-helpers.js";
import { createFile, deleteFile, getFileById } from "../repositories/file/file-repository.js";
import * as aiService from "../services/aituber/aituber-ai-service.js";
import * as livekitService from "../services/aituber/aituber-livekit-service.js";
import * as aituberService from "../services/aituber/aituber-service.js";
import * as ttsService from "../services/aituber/aituber-tts-service.js";
import { resolveCharacterAvatarUrl, sanitizeText, toCharacterResponse } from "./aituber-dto.js";

export const aituberRoutes = new Hono<AppEnv>();

// glTF binary magic number: "glTF" in little-endian
const GLTF_BINARY_MAGIC = 0x46546c67;

// --- Character Management ---

const createCharacterSchema = z.object({
  name: z.string().min(1).max(100),
  personality: z.string().min(1).max(2000),
  systemPrompt: z.string().min(1).max(5000),
  speakingStyle: z.string().max(500).optional(),
  languageCode: z.string().max(20).optional(),
  voiceName: z.string().max(100).optional(),
  avatarUrl: z.string().max(500).optional(),
  avatarFileId: z.string().min(1).optional(),
  isPublic: z.boolean().optional(),
});

aituberRoutes.post(
  "/characters",
  zValidator("json", createCharacterSchema),
  withErrorHandler("AITUBER_CHARACTER_CREATE_FAILED", "Failed to create character"),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    if (body.avatarFileId) {
      const file = await getFileById(body.avatarFileId);
      if (!file) return jsonError(c, 400, "INVALID_AVATAR_FILE", "Avatar file does not exist");
      if (user.role !== UserRole.Admin && file.uploaderId !== user.id) {
        return jsonError(c, 403, "FORBIDDEN", "Not authorized to use this avatar file");
      }
    }
    const character = await aituberService.createCharacter({
      ...body,
      createdBy: user.id,
    });
    return c.json({ character: toCharacterResponse(character) }, 201);
  }
);

aituberRoutes.get(
  "/characters",
  withErrorHandler("AITUBER_CHARACTER_LIST_FAILED", "Failed to list characters"),
  async (c) => {
    const characters = await aituberService.listCharacters();
    return c.json({ characters: characters.map((character) => toCharacterResponse(character)) });
  }
);

aituberRoutes.get(
  "/characters/:id",
  withErrorHandler("AITUBER_CHARACTER_GET_FAILED", "Failed to get character"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const character = await aituberService.getCharacter(id);
    if (!character) return jsonError(c, 404, "NOT_FOUND", "Character not found");
    if (!character.isPublic && !isOwnerOrAdmin(user, character.createdBy)) {
      return jsonError(c, 403, "FORBIDDEN", "Not authorized to view this character");
    }
    return c.json({ character: toCharacterResponse(character) });
  }
);

const updateCharacterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  personality: z.string().min(1).max(2000).optional(),
  systemPrompt: z.string().min(1).max(5000).optional(),
  speakingStyle: z.string().max(500).nullable().optional(),
  languageCode: z.string().max(20).optional(),
  voiceName: z.string().max(100).nullable().optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
  avatarFileId: z.string().min(1).nullable().optional(),
  isPublic: z.boolean().optional(),
});

aituberRoutes.patch(
  "/characters/:id",
  zValidator("json", updateCharacterSchema),
  withErrorHandler("AITUBER_CHARACTER_UPDATE_FAILED", "Failed to update character"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const existing = await aituberService.getCharacter(id);
    if (!existing) return jsonError(c, 404, "NOT_FOUND", "Character not found");
    if (!isOwnerOrAdmin(user, existing.createdBy)) {
      return jsonError(c, 403, "FORBIDDEN", "Not authorized to update this character");
    }
    const body = c.req.valid("json");
    if (body.avatarFileId) {
      const file = await getFileById(body.avatarFileId);
      if (!file) return jsonError(c, 400, "INVALID_AVATAR_FILE", "Avatar file does not exist");
      if (user.role !== UserRole.Admin && file.uploaderId !== user.id) {
        return jsonError(c, 403, "FORBIDDEN", "Not authorized to use this avatar file");
      }
    }
    const character = await aituberService.updateCharacter(id, body);
    return c.json({ character: toCharacterResponse(character) });
  }
);

aituberRoutes.post(
  "/characters/:id/avatar",
  withErrorHandler("AITUBER_AVATAR_UPLOAD_FAILED", "Failed to upload avatar"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const existing = await aituberService.getCharacter(id);
    if (!existing) return jsonError(c, 404, "NOT_FOUND", "Character not found");
    if (!isOwnerOrAdmin(user, existing.createdBy)) {
      return jsonError(c, 403, "FORBIDDEN", "Not authorized to update this character");
    }

    const contentType = c.req.header("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonError(c, 400, "FILE_MULTIPART_REQUIRED", "Multipart form data required");
    }

    const contentLength = Number(c.req.header("content-length") || "0");
    if (contentLength > MAX_VRM_FILE_SIZE_BYTES) {
      return jsonError(
        c,
        413,
        "FILE_TOO_LARGE",
        `File exceeds maximum size of ${MAX_VRM_FILE_SIZE_BYTES / 1024 / 1024} MB`
      );
    }

    const body = await c.req.parseBody();
    const uploadedFile = body.file as File;
    if (!uploadedFile) {
      return jsonError(c, 400, "FILE_REQUIRED", "File is required");
    }
    if (uploadedFile.size > MAX_VRM_FILE_SIZE_BYTES) {
      return jsonError(
        c,
        413,
        "FILE_TOO_LARGE",
        `File exceeds maximum size of ${MAX_VRM_FILE_SIZE_BYTES / 1024 / 1024} MB`
      );
    }
    if (!uploadedFile.name.toLowerCase().endsWith(".vrm")) {
      return jsonError(c, 400, "INVALID_VRM_FILE", "Only .vrm files are allowed");
    }

    // Validate glTF binary magic number (VRM is a glTF binary container)
    const headerBuffer = await uploadedFile.slice(0, 4).arrayBuffer();
    if (headerBuffer.byteLength < 4) {
      return jsonError(c, 400, "INVALID_VRM_FILE", "File is too small to be a valid VRM");
    }
    const magic = new DataView(headerBuffer).getUint32(0, true);
    if (magic !== GLTF_BINARY_MAGIC) {
      return jsonError(c, 400, "INVALID_VRM_FILE", "File is not a valid VRM/glTF binary");
    }

    const fileId = crypto.randomUUID();
    const safeName =
      uploadedFile.name
        .replace(/[/\\]/g, "_")
        .replace(/[^\x20-\x7e\x80-\uffff]/g, "")
        .replace(/\.{2,}/g, ".") || "avatar.vrm";
    const filename = `${fileId}-${safeName}`;
    const storagePath = buildStoragePath(`aituber/avatars/${filename}`);

    const arrayBuffer = await uploadedFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await saveFile(storagePath, buffer, uploadedFile.type || "model/gltf-binary");

    try {
      await createFile({
        id: fileId,
        filename: uploadedFile.name,
        contentType: uploadedFile.type || "model/gltf-binary",
        size: uploadedFile.size,
        storagePath,
        uploaderId: user.id,
        createdAt: new Date(),
      });
    } catch (dbError) {
      // Clean up the orphaned file on disk if DB insert fails
      await removeFile(storagePath).catch(() => {});
      throw dbError;
    }

    // Clean up old avatar file if replacing
    if (existing.avatarFileId) {
      const oldFile = await getFileById(existing.avatarFileId);
      if (oldFile) {
        console.log(`[aituber] Cleaning up old avatar file: ${oldFile.id}`);
        await removeFile(oldFile.storagePath).catch((err) =>
          console.warn(`[aituber] Failed to delete old avatar file ${oldFile.id}:`, err)
        );
      }
    }

    try {
      const character = await aituberService.updateCharacter(id, {
        avatarFileId: fileId,
      });
      return c.json({ character: toCharacterResponse(character) }, 201);
    } catch (updateError) {
      console.error(
        `[aituber] Failed to update character ${id}, cleaning up uploaded file ${fileId}:`,
        updateError
      );
      await deleteFile(fileId).catch(() => {});
      await removeFile(storagePath).catch(() => {});
      throw updateError;
    }
  }
);

aituberRoutes.delete(
  "/characters/:id",
  withErrorHandler("AITUBER_CHARACTER_DELETE_FAILED", "Failed to delete character"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const existing = await aituberService.getCharacter(id);
    if (!existing) return jsonError(c, 404, "NOT_FOUND", "Character not found");
    if (!isOwnerOrAdmin(user, existing.createdBy)) {
      return jsonError(c, 403, "FORBIDDEN", "Not authorized to delete this character");
    }
    await aituberService.deleteCharacter(id);
    return c.json({ success: true });
  }
);

// --- Voices ---

aituberRoutes.get(
  "/voices",
  withErrorHandler("AITUBER_VOICES_FAILED", "Failed to list voices"),
  async (c) => {
    const languageCode = c.req.query("languageCode");
    const voices = await ttsService.listVoices(languageCode || undefined);
    return c.json({
      voices: voices.map((v) => ({
        name: v.name,
        gender: v.ssmlGender,
        languageCodes: v.languageCodes,
      })),
    });
  }
);

// --- TTS Preview ---

const ttsPreviewSchema = z.object({
  text: z.string().min(1).max(200),
});

aituberRoutes.post(
  "/characters/:id/tts-preview",
  zValidator("json", ttsPreviewSchema),
  withErrorHandler("AITUBER_TTS_PREVIEW_FAILED", "Failed to synthesize preview"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const character = await aituberService.getCharacter(id);
    if (!character) return jsonError(c, 404, "NOT_FOUND", "Character not found");
    if (!character.isPublic && !isOwnerOrAdmin(user, character.createdBy)) {
      return jsonError(c, 403, "FORBIDDEN", "Not authorized to preview this character");
    }
    const { text } = c.req.valid("json");
    const result = await ttsService.synthesizeSpeech(
      text,
      character.languageCode,
      character.voiceName
    );
    return c.json({
      audio: result.audio.toString("base64"),
      mimeType: result.mimeType,
      visemes: result.visemes,
    });
  }
);

// --- Session Management ---

const createSessionSchema = z.object({
  characterId: z.string().min(1),
  title: z.string().min(1).max(200),
});

aituberRoutes.post(
  "/sessions",
  zValidator("json", createSessionSchema),
  withErrorHandler("AITUBER_SESSION_CREATE_FAILED", "Failed to create session"),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const character = await aituberService.getCharacter(body.characterId);
    if (!character) return jsonError(c, 404, "NOT_FOUND", "Character not found");
    const session = await aituberService.createSession({
      characterId: body.characterId,
      creatorId: user.id,
      title: body.title,
    });
    return c.json({ session }, 201);
  }
);

aituberRoutes.get(
  "/sessions",
  withErrorHandler("AITUBER_SESSION_LIST_FAILED", "Failed to list sessions"),
  async (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    // Live sessions are publicly viewable; non-live sessions are restricted to creator/admin
    if (status === "live") {
      const sessions = await aituberService.listSessions({ status });
      return c.json({ sessions });
    }
    const sessions = await aituberService.listSessions({
      ...(status ? { status } : {}),
      creatorId: user.role === UserRole.Admin ? undefined : user.id,
    });
    return c.json({ sessions });
  }
);

aituberRoutes.get(
  "/sessions/:id",
  withErrorHandler("AITUBER_SESSION_GET_FAILED", "Failed to get session"),
  async (c) => {
    const { id } = c.req.param();
    const session = await aituberService.getSession(id);
    if (!session) return jsonError(c, 404, "NOT_FOUND", "Session not found");
    const character = await aituberService.getCharacter(session.characterId);
    return c.json({
      session: {
        ...session,
        characterName: character?.name,
        characterAvatarUrl: character ? resolveCharacterAvatarUrl(character) : null,
      },
    });
  }
);

aituberRoutes.post(
  "/sessions/:id/start",
  withErrorHandler("AITUBER_SESSION_START_FAILED", "Failed to start session"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const session = await aituberService.getSession(id);
    if (!session) return jsonError(c, 404, "NOT_FOUND", "Session not found");
    if (!isOwnerOrAdmin(user, session.creatorId)) {
      return jsonError(c, 403, "FORBIDDEN", "Not authorized to start this session");
    }

    // Create LiveKit room
    await livekitService.createAituberRoom(session.roomName);

    // Start session
    const updated = await aituberService.startSession(id);

    // Get character and start AI processing loop
    const character = await aituberService.getCharacter(session.characterId);
    if (character) {
      await aiService.startProcessingLoop(id, character, session.roomName);
    }

    return c.json({ session: updated });
  }
);

aituberRoutes.post(
  "/sessions/:id/stop",
  withErrorHandler("AITUBER_SESSION_STOP_FAILED", "Failed to stop session"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const session = await aituberService.getSession(id);
    if (!session) return jsonError(c, 404, "NOT_FOUND", "Session not found");
    if (!isOwnerOrAdmin(user, session.creatorId)) {
      return jsonError(c, 403, "FORBIDDEN", "Not authorized to stop this session");
    }

    // Stop AI processing loop
    aiService.stopProcessingLoop(id);

    // Stop session
    const updated = await aituberService.stopSession(id);

    // Delete LiveKit room
    await livekitService.deleteAituberRoom(session.roomName);

    return c.json({ session: updated });
  }
);

// --- Viewer Operations ---

const sendMessageSchema = z.object({
  content: z.string().min(1).max(1000),
});

aituberRoutes.post(
  "/sessions/:id/messages",
  zValidator("json", sendMessageSchema),
  withErrorHandler("AITUBER_MESSAGE_SEND_FAILED", "Failed to send message"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const session = await aituberService.getSession(id);
    if (!session) return jsonError(c, 404, "NOT_FOUND", "Session not found");
    if (session.status !== "live") {
      return jsonError(c, 400, "SESSION_NOT_LIVE", "Session is not live");
    }
    const body = c.req.valid("json");
    const senderName = user.name || "Anonymous";
    const safeContent = sanitizeText(body.content);
    const message = await aituberService.sendViewerMessage({
      sessionId: id,
      senderUserId: user.id,
      senderName,
      content: safeContent,
    });

    // Also broadcast via data channel for immediate display
    await livekitService.sendDataToRoom(session.roomName, {
      type: "viewer-message",
      messageId: message.id,
      senderName,
      content: safeContent,
    });

    return c.json({ message }, 201);
  }
);

aituberRoutes.get(
  "/sessions/:id/messages",
  withErrorHandler("AITUBER_MESSAGE_LIST_FAILED", "Failed to list messages"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const session = await aituberService.getSession(id);
    if (!session) return jsonError(c, 404, "NOT_FOUND", "Session not found");
    // Only live sessions are publicly viewable; others require ownership
    if (session.status !== "live" && !isOwnerOrAdmin(user, session.creatorId)) {
      return jsonError(c, 403, "FORBIDDEN", "Not authorized to view messages");
    }
    const messages = await aituberService.listMessages(id);
    return c.json({ messages });
  }
);

aituberRoutes.get(
  "/sessions/:id/token",
  withErrorHandler("AITUBER_TOKEN_FAILED", "Failed to generate token"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const session = await aituberService.getSession(id);
    if (!session) return jsonError(c, 404, "NOT_FOUND", "Session not found");
    if (session.status !== "live") {
      return jsonError(c, 400, "SESSION_NOT_LIVE", "Session is not live");
    }
    const token = await livekitService.generateViewerToken(
      session.roomName,
      `viewer-${user.id}`,
      user.name
    );
    return c.json({ token });
  }
);
