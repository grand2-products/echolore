import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import {
  getEmailSettings,
  updateEmailSettings,
} from "../../services/admin/admin-service.js";
import { updateEmailSettingsSchema } from "./schemas.js";

export const adminEmailSettingsRoutes = new Hono<AppEnv>();

adminEmailSettingsRoutes.get("/email-settings", withErrorHandler(async (c) => {
  const settings = await getEmailSettings();
  // Mask sensitive fields
  return c.json({
    ...settings,
    resendApiKey: settings.resendApiKey ? "••••••••" : null,
    smtpPass: settings.smtpPass ? "••••••••" : null,
  });
}, "ADMIN_EMAIL_SETTINGS_FETCH_FAILED", "Failed to fetch email settings"));

adminEmailSettingsRoutes.put("/email-settings", zValidator("json", updateEmailSettingsSchema), withErrorHandler(async (c) => {
  const data = c.req.valid("json");
  // Strip masked placeholder values so we don't overwrite real secrets
  if (data.resendApiKey === "••••••••") delete data.resendApiKey;
  if (data.smtpPass === "••••••••") delete data.smtpPass;
  const updated = await updateEmailSettings(data);
  return c.json({
    ...updated,
    resendApiKey: updated.resendApiKey ? "••••••••" : null,
    smtpPass: updated.smtpPass ? "••••••••" : null,
  });
}, "ADMIN_EMAIL_SETTINGS_UPDATE_FAILED", "Failed to update email settings"));
