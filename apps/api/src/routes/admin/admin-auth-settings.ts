import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import {
  getAuthSettings,
  updateAuthSettings,
} from "../../services/admin/admin-service.js";
import { updateAuthSettingsSchema } from "./schemas.js";

export const adminAuthSettingsRoutes = new Hono<AppEnv>();

adminAuthSettingsRoutes.get("/auth-settings", withErrorHandler(async (c) => {
  const settings = await getAuthSettings();
  return c.json({
    ...settings,
    googleClientSecret: settings.googleClientSecret ? "••••••••" : null,
  });
}, "ADMIN_AUTH_SETTINGS_FETCH_FAILED", "Failed to fetch auth settings"));

adminAuthSettingsRoutes.put("/auth-settings", zValidator("json", updateAuthSettingsSchema), withErrorHandler(async (c) => {
  const data = c.req.valid("json");
  if (data.googleClientSecret === "••••••••") delete data.googleClientSecret;
  const updated = await updateAuthSettings(data);
  return c.json({
    ...updated,
    googleClientSecret: updated.googleClientSecret ? "••••••••" : null,
  });
}, "ADMIN_AUTH_SETTINGS_UPDATE_FAILED", "Failed to update auth settings"));
