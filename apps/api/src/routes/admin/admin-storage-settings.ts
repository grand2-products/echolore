import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { createStorageProvider, setStorageProvider } from "../../lib/file-storage.js";
import { maskSecrets, stripMaskedValues } from "../../lib/secret-mask.js";
import {
  getStorageSettings,
  updateStorageSettings,
  buildStorageConfig,
} from "../../services/admin/admin-service.js";
import { updateStorageSettingsSchema } from "./schemas.js";

const SECRET_FIELDS = ["s3SecretKey", "gcsKeyJson"] as const;

export const adminStorageSettingsRoutes = new Hono<AppEnv>();

adminStorageSettingsRoutes.get("/storage-settings", withErrorHandler(async (c) => {
  const settings = await getStorageSettings();
  return c.json(maskSecrets(settings, [...SECRET_FIELDS]));
}, "ADMIN_STORAGE_SETTINGS_FETCH_FAILED", "Failed to fetch storage settings"));

adminStorageSettingsRoutes.put("/storage-settings", zValidator("json", updateStorageSettingsSchema), withErrorHandler(async (c) => {
  const data = stripMaskedValues(c.req.valid("json"), [...SECRET_FIELDS]);
  const updated = await updateStorageSettings(data);

  // Apply the new provider immediately
  const config = await buildStorageConfig(updated);
  setStorageProvider(createStorageProvider(config));

  return c.json(maskSecrets(updated, [...SECRET_FIELDS]));
}, "ADMIN_STORAGE_SETTINGS_UPDATE_FAILED", "Failed to update storage settings"));

adminStorageSettingsRoutes.post("/storage-settings/test", async (c) => {
  try {
    const settings = await getStorageSettings();
    const config = await buildStorageConfig(settings);
    const testProvider = createStorageProvider(config);

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
