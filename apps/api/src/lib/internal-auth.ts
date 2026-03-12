import type { MiddlewareHandler } from "hono";
import { jsonError } from "./api-error.js";

const ROOM_AI_WORKER_SECRET = process.env.ROOM_AI_WORKER_SECRET || "";

export const requireRoomAiWorker: MiddlewareHandler = async (c, next) => {
  const providedSecret = c.req.header("x-room-ai-worker-secret")?.trim() ?? "";
  if (!ROOM_AI_WORKER_SECRET || providedSecret !== ROOM_AI_WORKER_SECRET) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  await next();
};
