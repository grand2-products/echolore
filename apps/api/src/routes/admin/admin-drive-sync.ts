import { Hono } from "hono";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { getDriveSyncStatus, triggerDriveSync } from "../../services/drive/drive-sync-service.js";

export const adminDriveSyncRoutes = new Hono<AppEnv>();

adminDriveSyncRoutes.post(
  "/drive-sync/trigger",
  withErrorHandler("DRIVE_SYNC_TRIGGER_FAILED", "Failed to trigger Drive sync"),
  async (c) => {
    const result = await triggerDriveSync();
    return c.json(result);
  }
);

adminDriveSyncRoutes.get(
  "/drive-sync/status",
  withErrorHandler("DRIVE_SYNC_STATUS_FAILED", "Failed to get Drive sync status"),
  async (c) => {
    const status = await getDriveSyncStatus();
    return c.json(status);
  }
);
