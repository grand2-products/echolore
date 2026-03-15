import { Hono } from "hono";
import type { AppEnv } from "../../lib/auth.js";
import { adminAgentRoutes } from "./admin-agents.js";
import { adminAuthSettingsRoutes } from "./admin-auth-settings.js";
import { adminGcpCredentialsRoutes } from "./admin-gcp-credentials.js";
import { adminEmailSettingsRoutes } from "./admin-email-settings.js";
import { adminGroupRoutes } from "./admin-groups.js";
import { adminLlmSettingsRoutes } from "./admin-llm-settings.js";
import { adminReindexRoutes } from "./admin-reindex.js";
import { adminSiteSettingsRoutes } from "./admin-site-settings.js";
import { adminSpacePermissionRoutes } from "./admin-space-permissions.js";
import { adminStorageSettingsRoutes } from "./admin-storage-settings.js";
import { adminUserRoutes } from "./admin-users.js";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.route("/", adminGroupRoutes);
adminRoutes.route("/", adminUserRoutes);
adminRoutes.route("/", adminAgentRoutes);
adminRoutes.route("/", adminSpacePermissionRoutes);
adminRoutes.route("/", adminSiteSettingsRoutes);
adminRoutes.route("/", adminAuthSettingsRoutes);
adminRoutes.route("/", adminGcpCredentialsRoutes);
adminRoutes.route("/", adminEmailSettingsRoutes);
adminRoutes.route("/", adminLlmSettingsRoutes);
adminRoutes.route("/", adminStorageSettingsRoutes);
adminRoutes.route("/", adminReindexRoutes);
