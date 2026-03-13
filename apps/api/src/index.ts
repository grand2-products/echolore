import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { authHandler, initAuthConfig } from "@hono/auth-js";
import { UserRole } from "@corp-internal/shared/contracts";
import { writeAuditLog } from "./lib/audit.js";
import { jsonError } from "./lib/api-error.js";
import { createStorageProvider, loadFile, setStorageProvider } from "./lib/file-storage.js";
import { type AppEnv, authGuard, requireRole } from "./lib/auth.js";
import { getAuthConfig } from "./lib/authjs-config.js";
import { getSiteSetting } from "./repositories/admin/admin-repository.js";
import { adminRoutes } from "./routes/admin.js";
import { getSiteSettings, getStorageSettings } from "./services/admin/admin-service.js";
import { authRoutes } from "./routes/auth.js";
import { filesRoutes } from "./routes/files.js";
import { internalRoomAiRoutes } from "./routes/internal-room-ai.js";
import { livekitRoutes } from "./routes/livekit.js";
import { livekitWebhookRoutes } from "./routes/livekit-webhook.js";
import { meetingsRoutes } from "./routes/meetings.js";
import { metricsRoutes } from "./routes/metrics.js";
import { usersRoutes } from "./routes/users.js";
import { startAutonomousAgentLoop } from "./services/meeting/autonomous-agent-service.js";
import { wikiRoutes } from "./routes/wiki.js";

// ---------------------------------------------------------------------------
// Required environment variable validation (fail-fast on startup)
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== "test") {
  const REQUIRED_ENV_VARS = ["AUTH_SECRET", "DATABASE_URL"] as const;
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  if (process.env.NODE_ENV === "production") {
    const REQUIRED_IN_PRODUCTION = ["CORS_ORIGIN", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const;
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable in production: ${key}`);
      }
    }
  }
}

const app = new Hono<AppEnv>();
const appTitle = process.env.APP_TITLE || "corp-internal";

app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? (process.env.NODE_ENV === "production" ? "https://app.example.com" : "http://localhost:3000"),
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Auth.js initialization (before authGuard)
app.use("*", initAuthConfig(() => getAuthConfig()));
// Auth.js routes only — authHandler returns 400 for unknown paths, so guard it
const authjsHandler = authHandler();
const AUTHJS_ACTIONS = new Set(["signin", "signout", "callback", "session", "csrf", "providers", "error", "verify-request"]);
app.use("/api/auth/*", async (c, next) => {
  // Extract the first path segment after /api/auth/
  const sub = c.req.path.replace(/^\/api\/auth\/?/, "").split("/")[0];
  if (sub && AUTHJS_ACTIONS.has(sub)) {
    return authjsHandler(c, next);
  }
  await next();
});

app.get("/", (c) => c.json({ message: `${appTitle} API`, version: "0.0.1" }));
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));
app.route("/internal/room-ai", internalRoomAiRoutes);
app.route("/api/livekit/webhook", livekitWebhookRoutes);
app.route("/api/auth", authRoutes);

app.get("/api/site-settings", async (c) => {
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
      hasSiteIcon: settings.hasSiteIcon,
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
      hasSiteIcon: false,
    });
  }
});

app.get("/api/site-icon", async (c) => {
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

app.use("/api/*", authGuard);
app.use("/api/admin/*", requireRole(UserRole.Admin));
app.use("/api/admin/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const actor = c.get("user");
    await writeAuditLog({
      actorUserId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      action: `admin.${method.toLowerCase()}`,
      resourceType: "admin-api",
      resourceId: c.req.path,
      metadata: { method, path: c.req.path },
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });
  }
  await next();
});

app.get("/api/auth/me", (c) => c.json({ user: c.get("user") ?? null, authMode: c.get("authMode") ?? null }));

app.route("/api/wiki", wikiRoutes);
app.route("/api/meetings", meetingsRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/files", filesRoutes);
app.route("/api/livekit", livekitRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/admin/metrics", metricsRoutes);

app.notFound((c) => jsonError(c, 404, "NOT_FOUND", "Not Found"));
app.onError((err, c) =>
  jsonError(c, 500, "INTERNAL_SERVER_ERROR", "Internal Server Error", err.message)
);

// Restore storage provider from DB settings on startup
(async () => {
  try {
    const storageSettings = await getStorageSettings();
    if (storageSettings.provider !== "local" || storageSettings.localPath) {
      setStorageProvider(
        createStorageProvider({
          provider: storageSettings.provider,
          localPath: storageSettings.localPath ?? undefined,
          s3Endpoint: storageSettings.s3Endpoint ?? undefined,
          s3Region: storageSettings.s3Region ?? undefined,
          s3Bucket: storageSettings.s3Bucket ?? undefined,
          s3AccessKey: storageSettings.s3AccessKey ?? undefined,
          s3SecretKey: storageSettings.s3SecretKey ?? undefined,
          s3ForcePathStyle: storageSettings.s3ForcePathStyle,
          gcsBucket: storageSettings.gcsBucket ?? undefined,
          gcsProjectId: storageSettings.gcsProjectId ?? undefined,
          gcsKeyJson: storageSettings.gcsKeyJson ?? undefined,
        }),
      );
      console.log(`Storage provider initialized: ${storageSettings.provider}`);
    }
  } catch {
    console.log("Storage provider: using default (local)");
  }
})();

const port = Number(process.env.PORT) || 3001;
console.log(`Server is running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });

// Start autonomous agent evaluation loop
startAutonomousAgentLoop();

export { app };
