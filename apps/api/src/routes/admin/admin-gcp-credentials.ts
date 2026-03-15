import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import {
  getGcpCredentials,
  updateGcpCredentials,
} from "../../services/admin/admin-service.js";
import { updateGcpCredentialsSchema } from "./schemas.js";

export const adminGcpCredentialsRoutes = new Hono<AppEnv>();

adminGcpCredentialsRoutes.get("/gcp-credentials", withErrorHandler(async (c) => {
  const creds = await getGcpCredentials();
  return c.json({
    ...creds,
    gcpServiceAccountKeyJson: creds.gcpServiceAccountKeyJson ? "••••••••" : null,
  });
}, "ADMIN_GCP_CREDENTIALS_FETCH_FAILED", "Failed to fetch GCP credentials"));

adminGcpCredentialsRoutes.put("/gcp-credentials", zValidator("json", updateGcpCredentialsSchema), withErrorHandler(async (c) => {
  const data = c.req.valid("json");
  if (data.gcpServiceAccountKeyJson === "••••••••") delete data.gcpServiceAccountKeyJson;
  const updated = await updateGcpCredentials(data);
  return c.json({
    ...updated,
    gcpServiceAccountKeyJson: updated.gcpServiceAccountKeyJson ? "••••••••" : null,
  });
}, "ADMIN_GCP_CREDENTIALS_UPDATE_FAILED", "Failed to update GCP credentials"));
