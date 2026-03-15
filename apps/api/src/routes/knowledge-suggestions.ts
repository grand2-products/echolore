import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import { canApproveKnowledge } from "../policies/authorization-policy.js";
import {
  getSuggestionById,
  listSuggestions,
} from "../repositories/knowledge/knowledge-suggestion-repository.js";
import {
  approveSuggestion,
  rejectSuggestion,
} from "../services/knowledge/knowledge-suggestion-service.js";

export const knowledgeSuggestionsRoutes = new Hono<AppEnv>();

// Middleware: check knowledge.approve permission
knowledgeSuggestionsRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (!(await canApproveKnowledge(user))) {
    return jsonError(c, 403, "FORBIDDEN", "Knowledge approval permission required");
  }
  await next();
});

// GET / — list suggestions
knowledgeSuggestionsRoutes.get(
  "/",
  withErrorHandler(
    async (c) => {
      const status = c.req.query("status");
      const sourceType = c.req.query("sourceType");
      const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
      const offset = Number(c.req.query("offset")) || 0;

      const { rows, total } = await listSuggestions({
        status: status || undefined,
        sourceType: sourceType || undefined,
        limit,
        offset,
      });

      return c.json({ suggestions: rows, total });
    },
    "KNOWLEDGE_LIST_FAILED",
    "Failed to list knowledge suggestions"
  )
);

// GET /:id — get suggestion detail
knowledgeSuggestionsRoutes.get(
  "/:id",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const suggestion = await getSuggestionById(id);
      if (!suggestion) {
        return jsonError(c, 404, "NOT_FOUND", "Suggestion not found");
      }
      return c.json({ suggestion });
    },
    "KNOWLEDGE_DETAIL_FAILED",
    "Failed to get knowledge suggestion"
  )
);

// POST /:id/approve — approve and apply suggestion
knowledgeSuggestionsRoutes.post(
  "/:id/approve",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const user = c.get("user");

      const { pageId } = await approveSuggestion(id, user.id);
      return c.json({ success: true, pageId });
    },
    "KNOWLEDGE_APPROVE_FAILED",
    "Failed to approve knowledge suggestion"
  )
);

// POST /:id/reject — reject suggestion
knowledgeSuggestionsRoutes.post(
  "/:id/reject",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const user = c.get("user");

      const body = (await c.req.json()) as { reason?: string };
      if (!body.reason) {
        return jsonError(c, 400, "REASON_REQUIRED", "Rejection reason is required");
      }

      await rejectSuggestion(id, user.id, body.reason);
      return c.json({ success: true });
    },
    "KNOWLEDGE_REJECT_FAILED",
    "Failed to reject knowledge suggestion"
  )
);
