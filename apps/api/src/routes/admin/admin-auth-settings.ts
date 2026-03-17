import type { AuthSettings } from "../../services/admin/admin-service.js";
import { getAuthSettings, updateAuthSettings } from "../../services/admin/admin-service.js";
import { createAdminSettingsRoutes } from "./create-settings-routes.js";
import { updateAuthSettingsSchema } from "./schemas.js";

export const adminAuthSettingsRoutes = createAdminSettingsRoutes<AuthSettings>({
  path: "auth-settings",
  secretFields: ["googleClientSecret"],
  getSettings: getAuthSettings,
  updateSettings: updateAuthSettings,
  validationSchema: updateAuthSettingsSchema,
  errorPrefix: "ADMIN_AUTH_SETTINGS",
  label: "auth settings",
});
