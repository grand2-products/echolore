import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { writeAuditLog } from "./lib/audit.js";
import { jsonError } from "./lib/api-error.js";
import { type AppEnv, authGuard, passwordCsrfGuard, requireRole } from "./lib/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { filesRoutes } from "./routes/files.js";
import { internalRoomAiRoutes } from "./routes/internal-room-ai.js";
import { livekitRoutes } from "./routes/livekit.js";
import { meetingsRoutes } from "./routes/meetings.js";
import { metricsRoutes } from "./routes/metrics.js";
import { usersRoutes } from "./routes/users.js";
import { wikiRoutes } from "./routes/wiki.js";

const app = new Hono<AppEnv>();
const appTitle = process.env.APP_TITLE || "corp-internal";

app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/", (c) => c.json({ message: `${appTitle} API`, version: "0.0.1" }));
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));
app.route("/internal/room-ai", internalRoomAiRoutes);
app.route("/api/auth", authRoutes);

app.use("/api/*", authGuard);
app.use("/api/*", passwordCsrfGuard);
app.use("/api/admin/*", requireRole("admin"));
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

const port = Number(process.env.PORT) || 3001;
console.log(`Server is running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });

export { app };
