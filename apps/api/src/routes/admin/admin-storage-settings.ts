import { Hono } from "hono";
import type { AppEnv } from "../../lib/auth.js";
import { createStorageProvider, setStorageProvider } from "../../lib/file-storage.js";
import type { StorageSettings } from "../../services/admin/admin-service.js";
import {
  buildStorageConfig,
  getStorageSettings,
  updateStorageSettings,
} from "../../services/admin/admin-service.js";
import { createAdminSettingsRoutes } from "./create-settings-routes.js";
import { updateStorageSettingsSchema } from "./schemas.js";

const settingsRoutes = createAdminSettingsRoutes<StorageSettings>({
  path: "storage-settings",
  secretFields: ["s3SecretKey", "gcsKeyJson"],
  getSettings: getStorageSettings,
  updateSettings: updateStorageSettings,
  validationSchema: updateStorageSettingsSchema,
  errorPrefix: "ADMIN_STORAGE_SETTINGS",
  label: "storage settings",
  onAfterUpdate: async (updated) => {
    const config = await buildStorageConfig(updated);
    setStorageProvider(createStorageProvider(config));
  },
});

export const adminStorageSettingsRoutes = new Hono<AppEnv>();
adminStorageSettingsRoutes.route("/", settingsRoutes);

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
