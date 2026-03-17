import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ZodSchema } from "zod";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { maskSecrets, stripMaskedValues } from "../../lib/secret-mask.js";

interface SettingsRouteConfig<T extends object> {
  path: string;
  secretFields: (keyof T & string)[];
  getSettings: () => Promise<T>;
  updateSettings: (input: Partial<T>) => Promise<T>;
  validationSchema: ZodSchema;
  errorPrefix: string;
  label: string;
  /** Optional hook called after a successful update, before returning the response. */
  onAfterUpdate?: (updated: T) => Promise<void>;
}

/**
 * Creates standard GET / PUT routes for an admin settings resource.
 *
 * GET  /<path>  – fetch settings with secrets masked
 * PUT  /<path>  – update settings, stripping masked placeholders and masking on response
 */
export function createAdminSettingsRoutes<T extends object>(
  config: SettingsRouteConfig<T>
): Hono<AppEnv> {
  const {
    path,
    secretFields,
    getSettings,
    updateSettings,
    validationSchema,
    errorPrefix,
    label,
    onAfterUpdate,
  } = config;

  const app = new Hono<AppEnv>();

  app.get(
    `/${path}`,
    withErrorHandler(`${errorPrefix}_FETCH_FAILED`, `Failed to fetch ${label}`),
    async (c) => {
      const settings = await getSettings();
      return c.json(maskSecrets(settings, secretFields));
    }
  );

  app.put(
    `/${path}`,
    zValidator("json", validationSchema),
    withErrorHandler(`${errorPrefix}_UPDATE_FAILED`, `Failed to update ${label}`),
    async (c) => {
      const data = stripMaskedValues(c.req.valid("json") as T, secretFields);
      const updated = await updateSettings(data);
      const response = c.json(maskSecrets(updated, secretFields));
      if (onAfterUpdate) {
        onAfterUpdate(updated).catch((err) =>
          console.error(`[${errorPrefix}] onAfterUpdate failed:`, err)
        );
      }
      return response;
    }
  );

  return app;
}
