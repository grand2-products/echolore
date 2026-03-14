import type { Context } from "hono";
import type { AppEnv } from "./auth.js";

export function parsePaginationParams(c: Context<AppEnv>): { limit: number; offset: number } {
  const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
  const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
  return { limit, offset };
}
