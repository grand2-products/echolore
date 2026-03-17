import type { GcpCredentials } from "../../services/admin/admin-service.js";
import { getGcpCredentials, updateGcpCredentials } from "../../services/admin/admin-service.js";
import { createAdminSettingsRoutes } from "./create-settings-routes.js";
import { updateGcpCredentialsSchema } from "./schemas.js";

export const adminGcpCredentialsRoutes = createAdminSettingsRoutes<GcpCredentials>({
  path: "gcp-credentials",
  secretFields: ["gcpServiceAccountKeyJson"],
  getSettings: getGcpCredentials,
  updateSettings: updateGcpCredentials,
  validationSchema: updateGcpCredentialsSchema,
  errorPrefix: "ADMIN_GCP_CREDENTIALS",
  label: "GCP credentials",
});
