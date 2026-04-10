import type { GithubSettings } from "../../services/admin/github-settings-service.js";
import {
  getGithubSettings,
  updateGithubSettings,
} from "../../services/admin/github-settings-service.js";
import { createAdminSettingsRoutes } from "./create-settings-routes.js";
import { updateGithubSettingsSchema } from "./schemas.js";

export const adminGithubSettingsRoutes = createAdminSettingsRoutes<GithubSettings>({
  path: "github-settings",
  secretFields: ["githubAppPrivateKey", "githubWebhookSecret"],
  getSettings: getGithubSettings,
  updateSettings: updateGithubSettings,
  validationSchema: updateGithubSettingsSchema,
  errorPrefix: "ADMIN_GITHUB_SETTINGS",
  label: "GitHub settings",
});
