import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { jsonError } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { authorizePageResource } from "../../policies/authorization-policy.js";
import { getPageById } from "../../services/wiki/wiki-service.js";
import {
  LlmNotConfiguredError,
  processShorthand,
} from "../../services/wiki/wiki-shorthand-service.js";

export const wikiShorthandRoutes = new Hono<AppEnv>();

const shorthandSchema = z.object({
  input: z.string().min(1).max(2000),
  pageTitle: z.string(),
  blocks: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      text: z.string(),
    })
  ),
});

wikiShorthandRoutes.post("/:pageId/shorthand", zValidator("json", shorthandSchema), async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return jsonError(c, 401, "UNAUTHORIZED", "Authentication required");
  }

  const pageId = c.req.param("pageId");
  const page = await getPageById(pageId);
  if (!page) {
    return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
  }

  const authz = await authorizePageResource(c, page.id, page.authorId, "write");
  if (!authz.allowed) {
    return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", authz.reason);
  }

  const { input, pageTitle, blocks } = c.req.valid("json");

  try {
    const result = await processShorthand(pageTitle, blocks, input);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (error instanceof LlmNotConfiguredError) {
      return jsonError(c, 503, "WIKI_SHORTHAND_LLM_UNAVAILABLE", "LLM is not configured", message);
    }
    return jsonError(c, 500, "WIKI_SHORTHAND_FAILED", "Failed to process shorthand", message);
  }
});
