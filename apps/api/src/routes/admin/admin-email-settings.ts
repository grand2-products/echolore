import type { EmailSettings } from "../../services/admin/admin-service.js";
import { getEmailSettings, updateEmailSettings } from "../../services/admin/admin-service.js";
import { createAdminSettingsRoutes } from "./create-settings-routes.js";
import { updateEmailSettingsSchema } from "./schemas.js";

export const adminEmailSettingsRoutes = createAdminSettingsRoutes<EmailSettings>({
  path: "email-settings",
  secretFields: ["resendApiKey", "smtpPass"],
  getSettings: getEmailSettings,
  updateSettings: updateEmailSettings,
  validationSchema: updateEmailSettingsSchema,
  errorPrefix: "ADMIN_EMAIL_SETTINGS",
  label: "email settings",
});
