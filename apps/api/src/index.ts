import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { wikiRoutes } from "./routes/wiki.js";
import { meetingsRoutes } from "./routes/meetings.js";
import { usersRoutes } from "./routes/users.js";
import { filesRoutes } from "./routes/files.js";
import { livekitRoutes } from "./routes/livekit.js";
import { adminRoutes } from "./routes/admin.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Health check
app.get("/", (c) => {
  return c.json({
    message: "grand2 Products 社内ポータル API",
    version: "0.0.1",
  });
});

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.route("/api/wiki", wikiRoutes);
app.route("/api/meetings", meetingsRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/files", filesRoutes);
app.route("/api/livekit", livekitRoutes);
app.route("/api/admin", adminRoutes);

// Error handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

app.onError((err, c) => {
  console.error("Server Error:", err);
  return c.json({ error: "Internal Server Error", message: err.message }, 500);
});

const port = Number(process.env.PORT) || 3001;

console.log(`🚀 Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

export { app };
