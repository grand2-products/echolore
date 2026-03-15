import type { MiddlewareHandler } from "hono";
import { jsonError } from "./api-error.js";
import type { AppEnv } from "./auth.js";

/**
 * Middleware that sets common security response headers.
 */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-XSS-Protection", "1; mode=block");
  c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
};

/**
 * CSRF protection middleware that validates the Origin/Referer header on
 * state-changing requests (POST, PUT, DELETE, PATCH).
 */
const CSRF_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

export const csrfProtection: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!CSRF_METHODS.has(c.req.method.toUpperCase())) {
    return next();
  }

  const path = c.req.path;

  // Skip CSRF check for Auth.js routes (they have their own CSRF)
  if (path.startsWith("/api/auth/")) {
    return next();
  }

  // Skip CSRF check for LiveKit webhook routes (use HMAC auth)
  if (path.startsWith("/api/livekit/webhook")) {
    return next();
  }

  // Skip CSRF check for internal routes (use X-Room-AI-Worker-Secret)
  if (path.startsWith("/api/internal/") || path.startsWith("/internal/")) {
    return next();
  }

  // Skip CSRF check for requests with Bearer token (API/mobile clients)
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return next();
  }

  // Check Origin or Referer against allowed CORS origin
  const allowedOrigin =
    process.env.CORS_ORIGIN ??
    (process.env.NODE_ENV === "production" ? "https://app.example.com" : "http://localhost:3000");
  const origin = c.req.header("Origin");
  const referer = c.req.header("Referer");

  if (origin) {
    if (origin !== allowedOrigin) {
      return jsonError(c, 403, "CSRF_REJECTED", "Cross-origin request rejected");
    }
    return next();
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (refererOrigin !== allowedOrigin) {
        return jsonError(c, 403, "CSRF_REJECTED", "Cross-origin request rejected");
      }
      return next();
    } catch {
      return jsonError(c, 403, "CSRF_REJECTED", "Cross-origin request rejected");
    }
  }

  // No Origin or Referer header on a state-changing request
  return jsonError(c, 403, "CSRF_REJECTED", "Missing Origin header");
};
