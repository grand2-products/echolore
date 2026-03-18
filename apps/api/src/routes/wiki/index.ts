import { Hono } from "hono";
import type { AppEnv } from "../../lib/auth.js";
import { wikiBlockRoutes } from "./wiki-blocks.js";
import { wikiFileRoutes } from "./wiki-files.js";
import { wikiImportRoutes } from "./wiki-import.js";
import { wikiPageRoutes } from "./wiki-pages.js";
import { wikiPermissionRoutes } from "./wiki-permissions.js";
import { wikiRevisionRoutes } from "./wiki-revisions.js";
import { wikiShorthandRoutes } from "./wiki-shorthand.js";
import { wikiSpaceRoutes } from "./wiki-spaces.js";
import { wikiTrashRoutes } from "./wiki-trash.js";

export const wikiRoutes = new Hono<AppEnv>();

// Mount order matters: more-specific prefixes first to avoid /:id clashes.
wikiRoutes.route("/", wikiSpaceRoutes); // /spaces, /spaces/personal, /groups
wikiRoutes.route("/", wikiTrashRoutes); // /trash, /trash/:id/restore, /trash/:id
wikiRoutes.route("/", wikiImportRoutes); // /import
wikiRoutes.route("/", wikiBlockRoutes); // /blocks, /blocks/:id
wikiRoutes.route("/", wikiShorthandRoutes); // /:pageId/shorthand
wikiRoutes.route("/", wikiRevisionRoutes); // /:id/revisions, /:id/revisions/:revisionId, ...
wikiRoutes.route("/", wikiFileRoutes); // /:id/files/:fileId/download
wikiRoutes.route("/", wikiPermissionRoutes); // /:id/permissions, /:id/permissions/inherit, ...
wikiRoutes.route("/", wikiPageRoutes); // /, /search, /:id (GET/POST/PUT/DELETE)
