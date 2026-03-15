import { UserRole } from "@corp-internal/shared/contracts";
import { authHandler, initAuthConfig } from "@hono/auth-js";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { jsonError } from "./lib/api-error.js";
import { auditAction } from "./lib/audit.js";
import { type AppEnv, authGuard, requireRole } from "./lib/auth.js";
import { getAuthConfig } from "./lib/authjs-config.js";
import { createStorageProvider, setStorageProvider } from "./lib/file-storage.js";
import { csrfProtection, securityHeaders } from "./lib/security-middleware.js";
import { adminRoutes } from "./routes/admin/index.js";
import { aiChatRoutes } from "./routes/ai-chat.js";
import { authRoutes } from "./routes/auth.js";
import { calendarRoutes } from "./routes/calendar.js";
import { coworkingHlsRoutes } from "./routes/coworking-hls.js";
import { egressLayoutRoutes } from "./routes/egress-layout.js";
import { filesRoutes } from "./routes/files.js";
import { internalRoomAiRoutes } from "./routes/internal-room-ai.js";
import { livekitWebhookRoutes } from "./routes/livekit-webhook.js";
import { livekitRoutes } from "./routes/livekit.js";
import { meetingsRoutes } from "./routes/meetings/index.js";
import { metricsRoutes } from "./routes/metrics.js";
import { siteRoutes } from "./routes/site.js";
import { usersRoutes } from "./routes/users.js";
import { createWikiCollabRoutes } from "./routes/wiki-collab.js";
import { wikiRoutes } from "./routes/wiki/index.js";
import { buildStorageConfig, getStorageSettings } from "./services/admin/admin-service.js";
import { startAutonomousAgentLoop } from "./services/meeting/autonomous-agent-service.js";
import { shutdownCollab } from "./services/wiki/yjs-collab-service.js";

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
    const REQUIRED_IN_PRODUCTION = [
      "CORS_ORIGIN",
      "LIVEKIT_API_KEY",
      "LIVEKIT_API_SECRET",
    ] as const;
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable in production: ${key}`);
      }
    }
  }
}

const app = new Hono<AppEnv>();
const apiPort = Number(process.env.PORT) || 3001;
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({
  app,
  baseUrl: `http://localhost:${apiPort}`,
});
const appTitle = process.env.APP_TITLE || "corp-internal";

app.use("*", logger());
app.use("*", prettyJSON());

// Security headers middleware
app.use("*", securityHeaders);

// CSRF protection via Origin header check
app.use("*", csrfProtection);

app.use(
  "*",
  cors({
    origin:
      process.env.CORS_ORIGIN ??
      (process.env.NODE_ENV === "production" ? "https://app.example.com" : "http://localhost:3000"),
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Auth.js initialization (before authGuard)
app.use(
  "*",
  initAuthConfig(() => getAuthConfig())
);
// Auth.js routes only — authHandler returns 400 for unknown paths, so guard it
const authjsHandler = authHandler();
const AUTHJS_ACTIONS = new Set([
  "signin",
  "signout",
  "callback",
  "session",
  "csrf",
  "providers",
  "error",
  "verify-request",
]);
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
app.route("/ws", createWikiCollabRoutes(upgradeWebSocket)); // WebSocket routes before authGuard
app.route("/internal/room-ai", internalRoomAiRoutes);
app.route("/api/livekit/webhook", livekitWebhookRoutes);
app.route("/api/auth", authRoutes);

app.route("/api", siteRoutes);

// HLS segments served without auth — accessed by hls.js which cannot attach auth headers
app.route("/api/coworking-hls", coworkingHlsRoutes);
// Egress layout page — loaded by LiveKit Egress headless Chromium (no auth)
app.route("/api/egress-layout", egressLayoutRoutes);

app.use("/api/*", authGuard);
app.use("/api/admin/*", requireRole(UserRole.Admin));
app.use("/api/admin/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    await auditAction(c, `admin.${method.toLowerCase()}`, "admin-api", c.req.path, {
      method,
      path: c.req.path,
    });
  }
  await next();
});

app.get("/api/auth/me", (c) =>
  c.json({ user: c.get("user") ?? null, authMode: c.get("authMode") ?? null })
);

app.route("/api/wiki", wikiRoutes);
app.route("/api/ai-chat", aiChatRoutes);
app.route("/api/meetings", meetingsRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/files", filesRoutes);
app.route("/api/livekit", livekitRoutes);
app.route("/api/calendar", calendarRoutes);
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
      const config = await buildStorageConfig(storageSettings);
      setStorageProvider(createStorageProvider(config));
      console.log(`Storage provider initialized: ${storageSettings.provider}`);
    }
  } catch {
    console.log("Storage provider: using default (local)");
  }
})();

console.log(`Server is running on http://localhost:${apiPort}`);
const server = serve({ fetch: app.fetch, port: apiPort });
injectWebSocket(server);

// Start autonomous agent evaluation loop
startAutonomousAgentLoop();

// Graceful shutdown: persist all Yjs documents before exit
const SHUTDOWN_TIMEOUT_MS = 30_000;
let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down gracefully`);
  const forceExit = setTimeout(() => {
    console.error("[server] Shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  try {
    await shutdownCollab();
  } catch (err) {
    console.error("[server] Error during shutdown", err);
  } finally {
    clearTimeout(forceExit);
  }
  process.exit(0);
}
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

export { app };
