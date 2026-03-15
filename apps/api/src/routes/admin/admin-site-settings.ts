import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { removeFile, saveFile } from "../../lib/file-storage.js";
import { deleteSiteSetting, upsertSiteSetting } from "../../repositories/admin/admin-repository.js";
import { getSiteSettings, updateSiteSettings } from "../../services/admin/admin-service.js";
import { updateSiteSettingsSchema } from "./schemas.js";

export const adminSiteSettingsRoutes = new Hono<AppEnv>();

adminSiteSettingsRoutes.get(
  "/settings",
  withErrorHandler("ADMIN_SETTINGS_FETCH_FAILED", "Failed to fetch site settings"),
  async (c) => {
    return c.json(await getSiteSettings());
  }
);

adminSiteSettingsRoutes.put(
  "/settings",
  zValidator("json", updateSiteSettingsSchema),
  withErrorHandler("ADMIN_SETTINGS_UPDATE_FAILED", "Failed to update site settings"),
  async (c) => {
    const data = c.req.valid("json");
    const updated = await updateSiteSettings(data);
    return c.json(updated);
  }
);

// ---------------------------------------------------------------------------
// Site icon upload / delete
// ---------------------------------------------------------------------------

const SITE_ICON_MAX_BYTES = 256 * 1024;
const SITE_ICON_ALLOWED_TYPES = new Set([
  "image/png",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);
const SITE_ICON_STORAGE_PATH = "site/site-icon";

adminSiteSettingsRoutes.post(
  "/site-icon",
  withErrorHandler("SITE_ICON_UPLOAD_FAILED", "Failed to upload site icon"),
  async (c) => {
    const contentType = c.req.header("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonError(c, 400, "SITE_ICON_MULTIPART_REQUIRED", "Multipart form data required");
    }

    const body = await c.req.parseBody();
    const uploadedFile = body.file as File | undefined;
    if (!uploadedFile) {
      return jsonError(c, 400, "SITE_ICON_FILE_REQUIRED", "File is required");
    }

    if (!SITE_ICON_ALLOWED_TYPES.has(uploadedFile.type)) {
      return jsonError(
        c,
        400,
        "SITE_ICON_FORMAT_ERROR",
        "Only PNG, SVG, and ICO files are allowed"
      );
    }

    if (uploadedFile.size > SITE_ICON_MAX_BYTES) {
      return jsonError(c, 400, "SITE_ICON_SIZE_ERROR", "File must be 256KB or smaller");
    }

    const arrayBuffer = await uploadedFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await saveFile(SITE_ICON_STORAGE_PATH, buffer);

    await upsertSiteSetting("siteIconStoragePath", SITE_ICON_STORAGE_PATH);
    await upsertSiteSetting("siteIconContentType", uploadedFile.type);

    return c.json({ success: true });
  }
);

adminSiteSettingsRoutes.delete(
  "/site-icon",
  withErrorHandler("SITE_ICON_DELETE_FAILED", "Failed to delete site icon"),
  async (c) => {
    await removeFile(SITE_ICON_STORAGE_PATH);

    await deleteSiteSetting("siteIconStoragePath");
    await deleteSiteSetting("siteIconContentType");

    return c.json({ success: true });
  }
);
