import { Hono } from "hono";
import { jsonError, tryCatchResponse, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { listGroupsWithMemberCounts } from "../../services/admin/admin-service.js";
import {
  canAccessSpace,
  getOrCreatePersonalSpace,
  getSpaceById,
  listVisibleSpaces,
  updateSpace,
} from "../../services/wiki/space-service.js";

export const wikiSpaceRoutes = new Hono<AppEnv>();

wikiSpaceRoutes.get(
  "/spaces",
  withErrorHandler("WIKI_SPACES_LIST_FAILED", "Failed to fetch spaces"),
  async (c) => {
    const user = c.get("user");
    const spaces = await listVisibleSpaces(user);
    return c.json({ spaces });
  }
);

wikiSpaceRoutes.put(
  "/spaces/:id",
  withErrorHandler("WIKI_SPACE_UPDATE_FAILED", "Failed to update space"),
  async (c) => {
    const user = c.get("user");
    if (!user?.id) {
      return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
    }
    const id = c.req.param("id");
    const body = await c.req.json<{ emoji?: string | null }>();
    const space = await getSpaceById(id);
    if (!space) {
      return jsonError(c, 404, "NOT_FOUND", "Space not found");
    }
    const allowed = await canAccessSpace(user, space, "write");
    if (!allowed) {
      return jsonError(c, 403, "FORBIDDEN", "No write access to this space");
    }
    const updated = await updateSpace(id, { emoji: body.emoji ?? null });
    return c.json({ space: updated });
  }
);

wikiSpaceRoutes.get(
  "/groups",
  withErrorHandler("WIKI_GROUPS_LIST_FAILED", "Failed to fetch groups"),
  async (c) => {
    const all = await listGroupsWithMemberCounts();
    return c.json({ groups: all });
  }
);

wikiSpaceRoutes.post("/spaces/personal", async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }
  return tryCatchResponse(
    c,
    async () => {
      const space = await getOrCreatePersonalSpace(c.get("user"));
      return c.json({ space });
    },
    "WIKI_SPACE_CREATE_FAILED",
    "Failed to create personal space"
  );
});
