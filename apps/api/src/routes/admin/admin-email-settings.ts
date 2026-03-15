import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { maskSecrets, stripMaskedValues } from "../../lib/secret-mask.js";
import { getEmailSettings, updateEmailSettings } from "../../services/admin/admin-service.js";
import { updateEmailSettingsSchema } from "./schemas.js";

const SECRET_FIELDS = ["resendApiKey", "smtpPass"] as const;

export const adminEmailSettingsRoutes = new Hono<AppEnv>();

adminEmailSettingsRoutes.get(
  "/email-settings",
  withErrorHandler(
    async (c) => {
      const settings = await getEmailSettings();
      return c.json(maskSecrets(settings, [...SECRET_FIELDS]));
    },
    "ADMIN_EMAIL_SETTINGS_FETCH_FAILED",
    "Failed to fetch email settings"
  )
);

adminEmailSettingsRoutes.put(
  "/email-settings",
  zValidator("json", updateEmailSettingsSchema),
  withErrorHandler(
    async (c) => {
      const data = stripMaskedValues(c.req.valid("json"), [...SECRET_FIELDS]);
      const updated = await updateEmailSettings(data);
      return c.json(maskSecrets(updated, [...SECRET_FIELDS]));
    },
    "ADMIN_EMAIL_SETTINGS_UPDATE_FAILED",
    "Failed to update email settings"
  )
);
