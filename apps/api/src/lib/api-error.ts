import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./auth.js";

export function jsonError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  error: string,
  message?: string
) {
  if (status >= 500) {
    console.error(
      `[${code}] ${status} ${c.req.method} ${c.req.path} – ${error}${message ? `: ${message}` : ""}`
    );
  } else if (status >= 400 && status !== 404) {
    console.warn(
      `[${code}] ${status} ${c.req.method} ${c.req.path} – ${error}${message ? `: ${message}` : ""}`
    );
  }
  return c.json(
    {
      error,
      code,
      ...(message ? { message } : {}),
    },
    status
  );
}

/**
 * Hono middleware that catches errors thrown by downstream handlers and
 * returns a JSON error response.  Thrown `Response` objects (from
 * `findOrFail` / `requireOwnerOrAdmin`) are re-thrown so Hono can use
 * them as the final response.
 *
 * @example
 * routes.get("/:id", withErrorHandler("FETCH_FAILED", "Failed to fetch"), async (c) => {
 *   // handler code
 * });
 */
export function withErrorHandler(
  errorCode: string,
  errorMessage: string,
  statusCode: ContentfulStatusCode = 500
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    try {
      await next();
    } catch (error) {
      if (error instanceof Response) throw error;
      console.error(error);
      // Never leak internal error details to clients — log only
      return jsonError(c, statusCode, errorCode, errorMessage);
    }
  });
}

/**
 * Inline try-catch wrapper for cases where the error handler cannot be
 * used as middleware (e.g. inside an outer handler that performs auth
 * checks before delegating).
 */
export async function tryCatchResponse(
  c: Context<AppEnv>,
  handler: () => Promise<Response>,
  errorCode: string,
  errorMessage: string,
  statusCode: ContentfulStatusCode = 500
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    // Never leak internal error details to clients — log only
    return jsonError(c, statusCode, errorCode, errorMessage);
  }
}
