import { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import type { AppEnv } from "../lib/auth.js";
import { resolveAuthjsSession } from "../lib/auth.js";
import { evaluatePageWriteAccess } from "../policies/authorization-policy.js";
import { getUserById } from "../repositories/user/user-repository.js";
import { getPageById } from "../services/wiki/wiki-service.js";
import {
  addConnection,
  handleMessage,
  removeConnection,
} from "../services/wiki/yjs-collab-service.js";

export function createWikiCollabRoutes(upgradeWebSocket: UpgradeWebSocket) {
  const app = new Hono<AppEnv>();

  app.get(
    "/wiki/collab/:pageId",
    upgradeWebSocket(async (c) => {
      const pageId = c.req.param("pageId") as string;

      try {
        // Authenticate via cookie-based JWT session
        const session = await resolveAuthjsSession(c);
        if (!session) {
          console.warn(`[wiki-collab] Auth failed for page ${pageId} (no session)`);
          return {
            onOpen(_evt: unknown, ws: { close(code: number, reason: string): void }) {
              ws.close(4001, "Unauthorized");
            },
          };
        }

        const user = session.user;

        // Check user is not suspended or deleted
        const dbUser = await getUserById(user.id);
        if (!dbUser || dbUser.suspendedAt || dbUser.deletedAt) {
          return {
            onOpen(_evt: unknown, ws: { close(code: number, reason: string): void }) {
              ws.close(4001, "Unauthorized");
            },
          };
        }

        // Check page exists and user has write access
        const page = await getPageById(pageId);
        if (!page) {
          console.warn(`[wiki-collab] Page not found: ${pageId}`);
          return {
            onOpen(_evt: unknown, ws: { close(code: number, reason: string): void }) {
              ws.close(4004, "Page not found");
            },
          };
        }

        const authResult = await evaluatePageWriteAccess(user, pageId, page.authorId);
        if (!authResult.allowed) {
          console.warn(`[wiki-collab] Access denied for user ${user.id} on page ${pageId}`);
          return {
            onOpen(_evt: unknown, ws: { close(code: number, reason: string): void }) {
              ws.close(4003, "Forbidden");
            },
          };
        }

        console.log(`[wiki-collab] Connection authorized: user=${user.id} page=${pageId}`);

        return {
          onOpen(_evt, ws) {
            addConnection(pageId, ws, user).catch((err) => {
              console.error(`[wiki-collab] addConnection failed for page ${pageId}:`, err);
            });
          },
          onMessage(evt, ws) {
            handleMessage(pageId, ws, evt.data as ArrayBuffer | string);
          },
          onClose(_evt, ws) {
            removeConnection(pageId, ws);
          },
          onError(_evt, ws) {
            removeConnection(pageId, ws);
          },
        };
      } catch (err) {
        console.error(`[wiki-collab] Unexpected error in upgrade handler for page ${pageId}:`, err);
        return {
          onOpen(_evt: unknown, ws: { close(code: number, reason: string): void }) {
            ws.close(4500, "Internal error");
          },
        };
      }
    })
  );

  return app;
}
