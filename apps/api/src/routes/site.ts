import { Hono } from "hono";
import { jsonError } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import { loadFile } from "../lib/file-storage.js";
import { getSiteSetting } from "../repositories/admin/admin-repository.js";
import { getSiteSettings } from "../services/admin/admin-service.js";

const appTitle = process.env.APP_TITLE || "corp-internal";

export const siteRoutes = new Hono<AppEnv>();

siteRoutes.get("/site-settings", async (c) => {
  try {
    const settings = await getSiteSettings();
    return c.json({
      siteTitle: settings.siteTitle ?? appTitle,
      siteTagline: settings.siteTagline ?? "Internal collaboration platform",
      livekitMeetingSimulcast: settings.livekitMeetingSimulcast,
      livekitMeetingDynacast: settings.livekitMeetingDynacast,
      livekitMeetingAdaptiveStream: settings.livekitMeetingAdaptiveStream,
      livekitCoworkingSimulcast: settings.livekitCoworkingSimulcast,
      livekitCoworkingDynacast: settings.livekitCoworkingDynacast,
      livekitCoworkingAdaptiveStream: settings.livekitCoworkingAdaptiveStream,
      livekitCoworkingMode: settings.livekitCoworkingMode,
      livekitCoworkingMcuWidth: settings.livekitCoworkingMcuWidth,
      livekitCoworkingMcuHeight: settings.livekitCoworkingMcuHeight,
      livekitCoworkingMcuFps: settings.livekitCoworkingMcuFps,
      livekitCoworkingFocusIdentity: settings.livekitCoworkingFocusIdentity,
      hasSiteIcon: settings.hasSiteIcon,
      googleOAuthEnabled: settings.googleOAuthEnabled,
    });
  } catch {
    return c.json({
      siteTitle: appTitle,
      siteTagline: "Internal collaboration platform",
      livekitMeetingSimulcast: true,
      livekitMeetingDynacast: true,
      livekitMeetingAdaptiveStream: true,
      livekitCoworkingSimulcast: true,
      livekitCoworkingDynacast: true,
      livekitCoworkingAdaptiveStream: true,
      livekitCoworkingMode: "sfu" as const,
      livekitCoworkingMcuWidth: 1280,
      livekitCoworkingMcuHeight: 720,
      livekitCoworkingMcuFps: 15,
      livekitCoworkingFocusIdentity: null,
      hasSiteIcon: false,
      googleOAuthEnabled: false,
    });
  }
});

siteRoutes.get("/site-icon", async (c) => {
  try {
    const [pathRow, typeRow] = await Promise.all([
      getSiteSetting("siteIconStoragePath"),
      getSiteSetting("siteIconContentType"),
    ]);

    if (!pathRow?.value || !typeRow?.value) {
      return jsonError(c, 404, "SITE_ICON_NOT_FOUND", "Site icon not configured");
    }

    const buffer = await loadFile(pathRow.value);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": typeRow.value,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error("Error serving site icon:", error);
    return jsonError(c, 404, "SITE_ICON_NOT_FOUND", "Site icon not available");
  }
});
