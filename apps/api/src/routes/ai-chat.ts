import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { jsonError, tryCatchResponse, withErrorHandler } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import {
  canAccessConversation,
  createConversation,
  deleteConversation,
  getConversationStats,
  listConversations,
  listMessagesByConversationId,
  sendMessageAndGetResponse,
  updateConversation,
} from "../services/ai-chat/ai-chat-service.js";

export const aiChatRoutes = new Hono<AppEnv>();

const createConversationSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  visibility: z.enum(["team", "private"]).optional(),
});

const updateConversationSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  visibility: z.enum(["team", "private"]).optional(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

// GET / — List conversations
aiChatRoutes.get(
  "/",
  withErrorHandler("AI_CHAT_LIST_FAILED", "Failed to list conversations"),
  async (c) => {
    const user = c.get("user");
    const mine = c.req.query("mine") === "1";
    const query = c.req.query("q")?.trim();

    const rows = await listConversations({
      userId: user.id,
      query: query || undefined,
    });

    // Filter: if mine=1, only show user's own conversations
    const filtered = mine ? rows.filter((r) => r.creatorId === user.id) : rows;

    // Batch fetch message counts and last messages (avoids N+1)
    const conversationIds = filtered.map((r) => r.id);
    const stats = await getConversationStats(conversationIds);

    const conversations = filtered.map((r) => {
      const stat = stats.get(r.id);
      return {
        ...r,
        creatorName: r.creator_name,
        messageCount: stat?.count ?? 0,
        lastMessagePreview: stat?.lastContent ?? null,
      };
    });

    return c.json({ conversations });
  }
);

// POST / — Create conversation
aiChatRoutes.post("/", zValidator("json", createConversationSchema), async (c) => {
  const user = c.get("user");

  if (!user?.id) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  return tryCatchResponse(
    c,
    async () => {
      const user = c.get("user");
      const data = c.req.valid("json");
      const now = new Date();
      const conversation = await createConversation({
        id: nanoid(),
        title: data.title || "New Chat",
        creatorId: user.id,
        visibility: data.visibility || "team",
        createdAt: now,
        updatedAt: now,
      });

      return c.json({ conversation }, 201);
    },
    "AI_CHAT_CREATE_FAILED",
    "Failed to create conversation"
  );
});

// GET /:id — Get conversation with all messages
aiChatRoutes.get(
  "/:id",
  withErrorHandler("AI_CHAT_FETCH_FAILED", "Failed to fetch conversation"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");

    const { allowed, conversation } = await canAccessConversation(user, id, "read");
    if (!conversation) {
      return jsonError(c, 404, "AI_CHAT_NOT_FOUND", "Conversation not found");
    }
    if (!allowed) {
      return jsonError(c, 403, "AI_CHAT_FORBIDDEN", "Forbidden");
    }

    const messages = (await listMessagesByConversationId(id)).map((m) => ({
      ...m,
      // Normalize citations: handle legacy snake_case keys from pre-CamelCasePlugin era
      citations: m.citations
        ? (m.citations as unknown as Array<Record<string, unknown>>).map((c) => ({
            pageId: (c.pageId ?? c.page_id) as string,
            pageTitle: (c.pageTitle ?? c.page_title) as string,
            snippet: (c.snippet as string) || undefined,
          }))
        : null,
    }));
    return c.json({ conversation, messages });
  }
);

// PATCH /:id — Update conversation
aiChatRoutes.patch(
  "/:id",
  zValidator("json", updateConversationSchema),
  withErrorHandler("AI_CHAT_UPDATE_FAILED", "Failed to update conversation"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const data = c.req.valid("json");

    const { allowed, conversation } = await canAccessConversation(user, id, "write");
    if (!conversation) {
      return jsonError(c, 404, "AI_CHAT_NOT_FOUND", "Conversation not found");
    }
    if (!allowed) {
      return jsonError(c, 403, "AI_CHAT_FORBIDDEN", "Forbidden");
    }

    const payload: { title?: string; visibility?: string; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (data.title !== undefined) payload.title = data.title;
    if (data.visibility !== undefined) payload.visibility = data.visibility;

    const updated = await updateConversation(id, payload);
    return c.json({ conversation: updated });
  }
);

// DELETE /:id — Delete conversation
aiChatRoutes.delete(
  "/:id",
  withErrorHandler("AI_CHAT_DELETE_FAILED", "Failed to delete conversation"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");

    const { allowed, conversation } = await canAccessConversation(user, id, "delete");
    if (!conversation) {
      return jsonError(c, 404, "AI_CHAT_NOT_FOUND", "Conversation not found");
    }
    if (!allowed) {
      return jsonError(c, 403, "AI_CHAT_FORBIDDEN", "Forbidden");
    }

    await deleteConversation(id);
    return c.json({ success: true });
  }
);

// POST /:id/messages — Send message and get AI response
aiChatRoutes.post(
  "/:id/messages",
  zValidator("json", sendMessageSchema),
  withErrorHandler("AI_CHAT_MESSAGE_FAILED", "Failed to send message"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");
    const { content } = c.req.valid("json");

    const { allowed, conversation } = await canAccessConversation(user, id, "write");
    if (!conversation) {
      return jsonError(c, 404, "AI_CHAT_NOT_FOUND", "Conversation not found");
    }
    if (!allowed) {
      return jsonError(c, 403, "AI_CHAT_FORBIDDEN", "Forbidden");
    }

    const { userMessage, assistantMessage } = await sendMessageAndGetResponse(user, id, content);
    return c.json({ userMessage, assistantMessage });
  }
);
