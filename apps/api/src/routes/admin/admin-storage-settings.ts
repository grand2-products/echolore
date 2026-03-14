import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { createStorageProvider, setStorageProvider } from "../../lib/file-storage.js";
import {
  getStorageSettings,
  updateStorageSettings,
} from "../../services/admin/admin-service.js";
import { updateStorageSettingsSchema } from "./schemas.js";

export const adminStorageSettingsRoutes = new Hono<AppEnv>();

adminStorageSettingsRoutes.get("/storage-settings", withErrorHandler(async (c) => {
  const settings = await getStorageSettings();
  return c.json({
    ...settings,
    s3SecretKey: settings.s3SecretKey ? "••••••••" : null,
    gcsKeyJson: settings.gcsKeyJson ? "••••••••" : null,
  });
}, "ADMIN_STORAGE_SETTINGS_FETCH_FAILED", "Failed to fetch storage settings"));

adminStorageSettingsRoutes.put("/storage-settings", zValidator("json", updateStorageSettingsSchema), withErrorHandler(async (c) => {
  const data = c.req.valid("json");
  // Strip masked placeholder values so we don't overwrite real secrets
  if (data.s3SecretKey === "••••••••") delete data.s3SecretKey;
  if (data.gcsKeyJson === "••••••••") delete data.gcsKeyJson;
  const updated = await updateStorageSettings(data);

  // Apply the new provider immediately
  setStorageProvider(
    createStorageProvider({
      provider: updated.provider,
      localPath: updated.localPath ?? undefined,
      s3Endpoint: updated.s3Endpoint ?? undefined,
      s3Region: updated.s3Region ?? undefined,
      s3Bucket: updated.s3Bucket ?? undefined,
      s3AccessKey: updated.s3AccessKey ?? undefined,
      s3SecretKey: updated.s3SecretKey ?? undefined,
      s3ForcePathStyle: updated.s3ForcePathStyle,
      gcsBucket: updated.gcsBucket ?? undefined,
      gcsProjectId: updated.gcsProjectId ?? undefined,
      gcsKeyJson: updated.gcsKeyJson ?? undefined,
    }),
  );

  return c.json({
    ...updated,
    s3SecretKey: updated.s3SecretKey ? "••••••••" : null,
    gcsKeyJson: updated.gcsKeyJson ? "••••••••" : null,
  });
}, "ADMIN_STORAGE_SETTINGS_UPDATE_FAILED", "Failed to update storage settings"));

adminStorageSettingsRoutes.post("/storage-settings/test", async (c) => {
  try {
    const settings = await getStorageSettings();
    const testProvider = createStorageProvider({
      provider: settings.provider,
      localPath: settings.localPath ?? undefined,
      s3Endpoint: settings.s3Endpoint ?? undefined,
      s3Region: settings.s3Region ?? undefined,
      s3Bucket: settings.s3Bucket ?? undefined,
      s3AccessKey: settings.s3AccessKey ?? undefined,
      s3SecretKey: settings.s3SecretKey ?? undefined,
      s3ForcePathStyle: settings.s3ForcePathStyle,
      gcsBucket: settings.gcsBucket ?? undefined,
      gcsProjectId: settings.gcsProjectId ?? undefined,
      gcsKeyJson: settings.gcsKeyJson ?? undefined,
    });

    const testPath = `_test/${crypto.randomUUID()}`;
    const testData = Buffer.from("storage-provider-test");

    await testProvider.save(testPath, testData);
    const loaded = await testProvider.load(testPath);
    await testProvider.remove(testPath);

    if (loaded.toString() !== "storage-provider-test") {
      return c.json({ ok: false, error: "Read-back verification failed" }, 502);
    }

    return c.json({ ok: true, provider: settings.provider });
  } catch (error) {
    console.error("Storage test failed:", error);
    return c.json({ ok: false, error: "Storage connection test failed" }, 502);
  }
});
