import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { maskSecrets, stripMaskedValues } from "../../lib/secret-mask.js";
import { getAuthSettings, updateAuthSettings } from "../../services/admin/admin-service.js";
import { updateAuthSettingsSchema } from "./schemas.js";

const SECRET_FIELDS = ["googleClientSecret"] as const;

export const adminAuthSettingsRoutes = new Hono<AppEnv>();

adminAuthSettingsRoutes.get(
  "/auth-settings",
  withErrorHandler("ADMIN_AUTH_SETTINGS_FETCH_FAILED", "Failed to fetch auth settings"),
  async (c) => {
    const settings = await getAuthSettings();
    return c.json(maskSecrets(settings, [...SECRET_FIELDS]));
  }
);

adminAuthSettingsRoutes.put(
  "/auth-settings",
  zValidator("json", updateAuthSettingsSchema),
  withErrorHandler("ADMIN_AUTH_SETTINGS_UPDATE_FAILED", "Failed to update auth settings"),
  async (c) => {
    const data = stripMaskedValues(c.req.valid("json"), [...SECRET_FIELDS]);
    const updated = await updateAuthSettings(data);
    return c.json(maskSecrets(updated, [...SECRET_FIELDS]));
  }
);
