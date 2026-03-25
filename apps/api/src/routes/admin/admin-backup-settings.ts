import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { jsonError } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { deleteBackup, listBackups, testBackupConnection } from "../../lib/backup-storage.js";
import { executeBackup, executeRestore } from "../../services/admin/backup-executor-service.js";
import { acquireJob, getJobStatus } from "../../services/admin/backup-job-service.js";
import {
  buildBackupStorageConfig,
  getBackupSettings,
  updateBackupSettings,
} from "../../services/admin/backup-settings-service.js";
import { createAdminSettingsRoutes } from "./create-settings-routes.js";
import { updateBackupSettingsSchema } from "./schemas.js";

const HEALTH_WARNING_HOURS = 26;
const HEALTH_CRITICAL_HOURS = 72;
const SAFE_BACKUP_NAME = /^[\w\-.]+$/; // Must match backup-executor-service.ts

const settingsRoutes = createAdminSettingsRoutes({
  path: "backup-settings",
  secretFields: ["s3SecretKey", "gcsKeyJson"],
  getSettings: getBackupSettings,
  updateSettings: updateBackupSettings,
  validationSchema: updateBackupSettingsSchema,
  errorPrefix: "ADMIN_BACKUP_SETTINGS",
  label: "backup settings",
});

export const adminBackupSettingsRoutes = new Hono<AppEnv>();
adminBackupSettingsRoutes.route("/", settingsRoutes);

// ---------------------------------------------------------------------------
// Settings test
// ---------------------------------------------------------------------------

adminBackupSettingsRoutes.post("/backup-settings/test", async (c) => {
  try {
    const settings = await getBackupSettings();
    if (!settings.provider) {
      return c.json({ ok: false, error: "Backup provider is not configured" }, 400);
    }
    const config = await buildBackupStorageConfig(settings);
    await testBackupConnection(config);
    return c.json({ ok: true, provider: settings.provider });
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined;
    return jsonError(c, 502, "BACKUP_TEST_FAILED", "Backup connection test failed", detail);
  }
});

// ---------------------------------------------------------------------------
// List backups + health status
// ---------------------------------------------------------------------------

adminBackupSettingsRoutes.get("/backups", async (c) => {
  try {
    const settings = await getBackupSettings();
    if (!settings.provider) {
      return c.json({ backups: [], latestAt: null, healthStatus: "unconfigured" });
    }
    const config = await buildBackupStorageConfig(settings);
    const backups = await listBackups(config);

    const latest = backups[0];
    const latestAt = latest?.createdAt ?? null;

    let healthStatus: "healthy" | "warning" | "critical" | "unconfigured" = "critical";
    if (latestAt) {
      const ageMs = Date.now() - new Date(latestAt).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      if (ageHours < HEALTH_WARNING_HOURS) {
        healthStatus = "healthy";
      } else if (ageHours < HEALTH_CRITICAL_HOURS) {
        healthStatus = "warning";
      }
    }

    return c.json({ backups, latestAt, healthStatus });
  } catch (error) {
    console.error(`[BACKUP_LIST_FAILED] GET ${c.req.path}`, error);
    return c.json({ backups: [], latestAt: null, healthStatus: "critical" });
  }
});

// ---------------------------------------------------------------------------
// Job status (polling)
// ---------------------------------------------------------------------------

adminBackupSettingsRoutes.get("/backups/status", (c) => {
  return c.json(getJobStatus());
});

// ---------------------------------------------------------------------------
// Run backup (fire-and-forget)
// ---------------------------------------------------------------------------

adminBackupSettingsRoutes.post("/backups/run", async (c) => {
  const settings = await getBackupSettings();
  if (!settings.provider) {
    return c.json({ error: "Backup provider is not configured" }, 400);
  }
  if (!acquireJob("backup", `db-pending.dump`)) {
    return c.json({ error: "A backup operation is already in progress" }, 409);
  }
  void executeBackup()
    .then(() => console.log(JSON.stringify({ event: "admin.backup.done" })))
    .catch((err) => console.error("Backup execution failed:", err));
  return c.json({ success: true, message: "Backup started" }, 202);
});

// ---------------------------------------------------------------------------
// Restore (fire-and-forget)
// ---------------------------------------------------------------------------

adminBackupSettingsRoutes.post(
  "/backups/restore",
  zValidator(
    "json",
    z.object({
      backupName: z.string().min(1),
      confirm: z.literal(true),
    })
  ),
  async (c) => {
    const settings = await getBackupSettings();
    if (!settings.provider) {
      return c.json({ error: "Backup provider is not configured" }, 400);
    }
    const { backupName } = c.req.valid("json");
    if (!SAFE_BACKUP_NAME.test(backupName)) {
      return c.json({ error: "Invalid backup name" }, 400);
    }
    if (!acquireJob("restore", backupName)) {
      return c.json({ error: "A backup operation is already in progress" }, 409);
    }
    void executeRestore(backupName)
      .then(() => console.log(JSON.stringify({ event: "admin.restore.done", backupName })))
      .catch((err) => console.error("Restore execution failed:", err));
    return c.json({ success: true, message: "Restore started" }, 202);
  }
);

// ---------------------------------------------------------------------------
// Delete backup
// ---------------------------------------------------------------------------

adminBackupSettingsRoutes.delete("/backups/:name", async (c) => {
  try {
    const name = c.req.param("name");
    if (!SAFE_BACKUP_NAME.test(name)) {
      return c.json({ error: "Invalid backup name" }, 400);
    }
    const settings = await getBackupSettings();
    if (!settings.provider) {
      return c.json({ error: "Backup provider is not configured" }, 400);
    }
    const config = await buildBackupStorageConfig(settings);
    await deleteBackup(config, `db/${name}`);
    return c.json({ success: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined;
    return jsonError(c, 500, "BACKUP_DELETE_FAILED", "Failed to delete backup", detail);
  }
});
