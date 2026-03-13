import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { jsonError } from "./api-error.js";

const ROOM_AI_WORKER_SECRET = process.env.ROOM_AI_WORKER_SECRET ?? "";

export const requireRoomAiWorker: MiddlewareHandler = async (c, next) => {
  if (ROOM_AI_WORKER_SECRET.length === 0) {
    return jsonError(c, 503, "WORKER_AUTH_UNCONFIGURED", "Worker authentication is not configured");
  }

  const providedSecret = c.req.header("x-room-ai-worker-secret")?.trim() ?? "";
  if (
    providedSecret.length === 0 ||
    providedSecret.length !== ROOM_AI_WORKER_SECRET.length ||
    !timingSafeEqual(Buffer.from(providedSecret), Buffer.from(ROOM_AI_WORKER_SECRET))
  ) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  await next();
};
