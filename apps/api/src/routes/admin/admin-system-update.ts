import type {
  CheckUpdateResponse,
  StartUpdateResponse,
  SystemStatusResponse,
  UpdateProgressResponse,
} from "@echolore/shared/contracts";
import type { Context } from "hono";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";

const UPDATER_URL = process.env.UPDATER_URL || "http://updater:8787";
const UPDATER_SECRET = process.env.UPDATER_SECRET || "";

export const adminSystemUpdateRoutes = new Hono<AppEnv>();

async function proxyToUpdater(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${UPDATER_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-echolore-updater-secret": UPDATER_SECRET,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

function requireUpdater(c: Context<AppEnv>): Response | null {
  if (!UPDATER_SECRET) {
    return jsonError(
      c,
      503,
      "UPDATER_UNAVAILABLE",
      "System updater is not configured"
    ) as unknown as Response;
  }
  return null;
}

adminSystemUpdateRoutes.get(
  "/system/status",
  withErrorHandler("SYSTEM_STATUS_FAILED", "Failed to get system status"),
  async (c) => {
    const unavailable = requireUpdater(c);
    if (unavailable) return unavailable;

    const resp = await proxyToUpdater("/status");
    const data: SystemStatusResponse = await resp.json();
    return c.json(data);
  }
);

adminSystemUpdateRoutes.get(
  "/system/check-update",
  withErrorHandler("SYSTEM_CHECK_UPDATE_FAILED", "Failed to check for updates"),
  async (c) => {
    const unavailable = requireUpdater(c);
    if (unavailable) return unavailable;

    const resp = await proxyToUpdater("/check");
    const data: CheckUpdateResponse = await resp.json();
    return c.json(data);
  }
);

adminSystemUpdateRoutes.post(
  "/system/update",
  withErrorHandler("SYSTEM_UPDATE_FAILED", "Failed to start update"),
  async (c) => {
    const unavailable = requireUpdater(c);
    if (unavailable) return unavailable;

    const body = await c.req.json().catch(() => ({}));
    const resp = await proxyToUpdater("/update", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data: StartUpdateResponse = await resp.json();
    return c.json(data);
  }
);

adminSystemUpdateRoutes.get(
  "/system/update/progress",
  withErrorHandler("SYSTEM_PROGRESS_FAILED", "Failed to get update progress"),
  async (c) => {
    const unavailable = requireUpdater(c);
    if (unavailable) return unavailable;

    const resp = await proxyToUpdater("/progress");
    const data: UpdateProgressResponse = await resp.json();
    return c.json(data);
  }
);

adminSystemUpdateRoutes.post(
  "/system/rollback",
  withErrorHandler("SYSTEM_ROLLBACK_FAILED", "Failed to rollback"),
  async (c) => {
    const unavailable = requireUpdater(c);
    if (unavailable) return unavailable;

    const resp = await proxyToUpdater("/rollback", { method: "POST" });
    const data = await resp.json();
    return c.json(data);
  }
);
