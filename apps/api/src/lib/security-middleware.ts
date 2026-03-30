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
  c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
  c.res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:; media-src 'self' blob: https:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
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

  // Skip CSRF check for guest meeting join routes (invite token is the protection)
  if (path.startsWith("/api/meetings/join/")) {
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

  // Skip CSRF check for requests with Bearer token (API/mobile clients).
  // Bearer tokens are not automatically attached by browsers, so they are
  // inherently CSRF-safe. We validate the token contains a dot (our custom
  // token format: base64url(payload).base64url(hmac)) to reject trivially
  // spoofed headers.
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.includes(".") && token.length >= 16) {
      return next();
    }
  }

  // Check Origin or Referer against allowed CORS origins
  const allowedOrigins = new Set(
    (process.env.CORS_ORIGIN ?? "http://localhost:17760").split(",").map((s) => s.trim())
  );
  const origin = c.req.header("Origin");
  const referer = c.req.header("Referer");

  if (origin) {
    if (!allowedOrigins.has(origin)) {
      return jsonError(c, 403, "CSRF_REJECTED", "Cross-origin request rejected");
    }
    return next();
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowedOrigins.has(refererOrigin)) {
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
