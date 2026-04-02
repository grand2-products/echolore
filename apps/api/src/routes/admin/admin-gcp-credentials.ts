import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import type { GcpCredentials } from "../../services/admin/admin-service.js";
import { getGcpCredentials, updateGcpCredentials } from "../../services/admin/admin-service.js";
import { createAdminSettingsRoutes } from "./create-settings-routes.js";
import { updateGcpCredentialsSchema } from "./schemas.js";

const crudRoutes = createAdminSettingsRoutes<GcpCredentials>({
  path: "gcp-credentials",
  secretFields: ["gcpServiceAccountKeyJson"],
  getSettings: getGcpCredentials,
  updateSettings: updateGcpCredentials,
  validationSchema: updateGcpCredentialsSchema,
  errorPrefix: "ADMIN_GCP_CREDENTIALS",
  label: "GCP credentials",
});

const testRoutes = new Hono<AppEnv>();

testRoutes.post(
  "/gcp-credentials/test",
  withErrorHandler("GCP_CREDENTIALS_TEST_FAILED", "GCP credentials test failed"),
  async (c) => {
    const creds = await getGcpCredentials();
    if (!creds.gcpServiceAccountKeyJson) {
      return jsonError(
        c,
        400,
        "GCP_KEY_NOT_CONFIGURED",
        "GCP service account key JSON is not configured"
      );
    }

    let parsed: { client_email?: string; project_id?: string };
    try {
      parsed = JSON.parse(creds.gcpServiceAccountKeyJson);
    } catch {
      return jsonError(c, 400, "GCP_KEY_INVALID_JSON", "Service account key is not valid JSON");
    }

    try {
      const { GoogleAuth } = await import("google-auth-library");
      const auth = new GoogleAuth({
        credentials: parsed,
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      });
      const client = await auth.getClient();
      // Perform a lightweight token fetch to verify the credentials
      await client.getAccessToken();

      return c.json({
        ok: true,
        projectId: parsed.project_id ?? creds.gcpProjectId,
        clientEmail: parsed.client_email,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : undefined;
      return jsonError(c, 502, "GCP_AUTH_FAILED", "Failed to authenticate with GCP", detail);
    }
  }
);

export const adminGcpCredentialsRoutes = new Hono<AppEnv>();
adminGcpCredentialsRoutes.route("/", crudRoutes);
adminGcpCredentialsRoutes.route("/", testRoutes);
