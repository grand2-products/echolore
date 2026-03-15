import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { jsonError, withErrorHandler } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import { isOwnerOrAdmin } from "../lib/route-helpers.js";
import * as aiService from "../services/aituber/aituber-ai-service.js";
import * as livekitService from "../services/aituber/aituber-livekit-service.js";
import * as aituberService from "../services/aituber/aituber-service.js";

export const aituberRoutes = new Hono<AppEnv>();

// --- Character Management ---

const createCharacterSchema = z.object({
  name: z.string().min(1).max(100),
  personality: z.string().min(1).max(2000),
  systemPrompt: z.string().min(1).max(5000),
  speakingStyle: z.string().max(500).optional(),
  languageCode: z.string().max(20).optional(),
  voiceName: z.string().max(100).optional(),
  avatarUrl: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

aituberRoutes.post(
  "/characters",
  zValidator("json", createCharacterSchema),
  withErrorHandler(
    async (c) => {
      const user = c.get("user");
      const body = c.req.valid("json");
      const character = await aituberService.createCharacter({
        ...body,
        createdBy: user.id,
      });
      return c.json({ character }, 201);
    },
    "AITUBER_CHARACTER_CREATE_FAILED",
    "Failed to create character"
  )
);

aituberRoutes.get(
  "/characters",
  withErrorHandler(
    async (c) => {
      const characters = await aituberService.listCharacters();
      return c.json({ characters });
    },
    "AITUBER_CHARACTER_LIST_FAILED",
    "Failed to list characters"
  )
);

aituberRoutes.get(
  "/characters/:id",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const user = c.get("user");
      const character = await aituberService.getCharacter(id);
      if (!character) return jsonError(c, 404, "NOT_FOUND", "Character not found");
      if (!character.isPublic && !isOwnerOrAdmin(user, character.createdBy)) {
        return jsonError(c, 403, "FORBIDDEN", "Not authorized to view this character");
      }
      return c.json({ character });
    },
    "AITUBER_CHARACTER_GET_FAILED",
    "Failed to get character"
  )
);

const updateCharacterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  personality: z.string().min(1).max(2000).optional(),
  systemPrompt: z.string().min(1).max(5000).optional(),
  speakingStyle: z.string().max(500).nullable().optional(),
  languageCode: z.string().max(20).optional(),
  voiceName: z.string().max(100).nullable().optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
  isPublic: z.boolean().optional(),
});

aituberRoutes.patch(
  "/characters/:id",
  zValidator("json", updateCharacterSchema),
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const user = c.get("user");
      const existing = await aituberService.getCharacter(id);
      if (!existing) return jsonError(c, 404, "NOT_FOUND", "Character not found");
      if (!isOwnerOrAdmin(user, existing.createdBy)) {
        return jsonError(c, 403, "FORBIDDEN", "Not authorized to update this character");
      }
      const body = c.req.valid("json");
      const character = await aituberService.updateCharacter(id, body);
      return c.json({ character });
    },
    "AITUBER_CHARACTER_UPDATE_FAILED",
    "Failed to update character"
  )
);

aituberRoutes.delete(
  "/characters/:id",
  withErrorHandler(
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
    },
    "AITUBER_CHARACTER_DELETE_FAILED",
    "Failed to delete character"
  )
);

// --- Session Management ---

const createSessionSchema = z.object({
  characterId: z.string().min(1),
  title: z.string().min(1).max(200),
});

aituberRoutes.post(
  "/sessions",
  zValidator("json", createSessionSchema),
  withErrorHandler(
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
    },
    "AITUBER_SESSION_CREATE_FAILED",
    "Failed to create session"
  )
);

aituberRoutes.get(
  "/sessions",
  withErrorHandler(
    async (c) => {
      const status = c.req.query("status");
      const sessions = await aituberService.listSessions(status ? { status } : undefined);
      return c.json({ sessions });
    },
    "AITUBER_SESSION_LIST_FAILED",
    "Failed to list sessions"
  )
);

aituberRoutes.get(
  "/sessions/:id",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const session = await aituberService.getSession(id);
      if (!session) return jsonError(c, 404, "NOT_FOUND", "Session not found");
      const character = await aituberService.getCharacter(session.characterId);
      return c.json({
        session: { ...session, characterName: character?.name },
      });
    },
    "AITUBER_SESSION_GET_FAILED",
    "Failed to get session"
  )
);

aituberRoutes.post(
  "/sessions/:id/start",
  withErrorHandler(
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
    },
    "AITUBER_SESSION_START_FAILED",
    "Failed to start session"
  )
);

aituberRoutes.post(
  "/sessions/:id/stop",
  withErrorHandler(
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
    },
    "AITUBER_SESSION_STOP_FAILED",
    "Failed to stop session"
  )
);

// --- Viewer Operations ---

const sendMessageSchema = z.object({
  content: z.string().min(1).max(1000),
  senderName: z.string().min(1).max(100),
});

aituberRoutes.post(
  "/sessions/:id/messages",
  zValidator("json", sendMessageSchema),
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const user = c.get("user");
      const session = await aituberService.getSession(id);
      if (!session) return jsonError(c, 404, "NOT_FOUND", "Session not found");
      if (session.status !== "live") {
        return jsonError(c, 400, "SESSION_NOT_LIVE", "Session is not live");
      }
      const body = c.req.valid("json");
      const message = await aituberService.sendViewerMessage({
        sessionId: id,
        senderUserId: user.id,
        senderName: body.senderName,
        content: body.content,
      });

      // Also broadcast via data channel for immediate display
      await livekitService.sendDataToRoom(session.roomName, {
        type: "viewer-message",
        messageId: message.id,
        senderName: body.senderName,
        content: body.content,
      });

      return c.json({ message }, 201);
    },
    "AITUBER_MESSAGE_SEND_FAILED",
    "Failed to send message"
  )
);

aituberRoutes.get(
  "/sessions/:id/messages",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const session = await aituberService.getSession(id);
      if (!session) return jsonError(c, 404, "NOT_FOUND", "Session not found");
      const messages = await aituberService.listMessages(id);
      return c.json({ messages });
    },
    "AITUBER_MESSAGE_LIST_FAILED",
    "Failed to list messages"
  )
);

aituberRoutes.get(
  "/sessions/:id/token",
  withErrorHandler(
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
    },
    "AITUBER_TOKEN_FAILED",
    "Failed to generate token"
  )
);
