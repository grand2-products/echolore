import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { listGroupsWithMemberCounts } from "../../services/admin/admin-service.js";
import {
  getOrCreatePersonalSpace,
  listVisibleSpaces,
} from "../../services/wiki/space-service.js";

export const wikiSpaceRoutes = new Hono<AppEnv>();

wikiSpaceRoutes.get("/spaces", withErrorHandler(async (c) => {
  const user = c.get("user");
  const spaces = await listVisibleSpaces(user);
  return c.json({ spaces });
}, "WIKI_SPACES_LIST_FAILED", "Failed to fetch spaces"));

wikiSpaceRoutes.get("/groups", withErrorHandler(async (c) => {
  const all = await listGroupsWithMemberCounts();
  return c.json({ groups: all });
}, "WIKI_GROUPS_LIST_FAILED", "Failed to fetch groups"));

wikiSpaceRoutes.post("/spaces/personal", async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }
  return withErrorHandler(async (c) => {
    const space = await getOrCreatePersonalSpace(c.get("user"));
    return c.json({ space });
  }, "WIKI_SPACE_CREATE_FAILED", "Failed to create personal space")(c);
});
