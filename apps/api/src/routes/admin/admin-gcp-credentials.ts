import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { maskSecrets, stripMaskedValues } from "../../lib/secret-mask.js";
import { getGcpCredentials, updateGcpCredentials } from "../../services/admin/admin-service.js";
import { updateGcpCredentialsSchema } from "./schemas.js";

const SECRET_FIELDS = ["gcpServiceAccountKeyJson"] as const;

export const adminGcpCredentialsRoutes = new Hono<AppEnv>();

adminGcpCredentialsRoutes.get(
  "/gcp-credentials",
  withErrorHandler("ADMIN_GCP_CREDENTIALS_FETCH_FAILED", "Failed to fetch GCP credentials"),
  async (c) => {
    const creds = await getGcpCredentials();
    return c.json(maskSecrets(creds, [...SECRET_FIELDS]));
  }
);

adminGcpCredentialsRoutes.put(
  "/gcp-credentials",
  zValidator("json", updateGcpCredentialsSchema),
  withErrorHandler("ADMIN_GCP_CREDENTIALS_UPDATE_FAILED", "Failed to update GCP credentials"),
  async (c) => {
    const data = stripMaskedValues(c.req.valid("json"), [...SECRET_FIELDS]);
    const updated = await updateGcpCredentials(data);
    return c.json(maskSecrets(updated, [...SECRET_FIELDS]));
  }
);
