import type { DriveSettings } from "../../services/admin/admin-service.js";
import { getDriveSettings, updateDriveSettings } from "../../services/admin/admin-service.js";
import { createAdminSettingsRoutes } from "./create-settings-routes.js";
import { updateDriveSettingsSchema } from "./schemas.js";

export const adminDriveSettingsRoutes = createAdminSettingsRoutes<DriveSettings>({
  path: "drive-settings",
  secretFields: [],
  getSettings: getDriveSettings,
  updateSettings: updateDriveSettings,
  validationSchema: updateDriveSettingsSchema,
  errorPrefix: "ADMIN_DRIVE_SETTINGS",
  label: "Drive settings",
});
