import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function jsonError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  error: string,
  message?: string
) {
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
 * Wraps a route handler with a standard try-catch that logs the error and
 * returns a JSON error response.  Use this to eliminate the duplicated
 * `try { … } catch { console.error(…); return jsonError(…); }` pattern
 * across route files.
 *
 * The generic parameter preserves the exact handler signature so Hono's
 * type inference (including `zValidator` augmented context types) continues
 * to work correctly.
 */
export function withErrorHandler<H extends (c: any) => Promise<Response>>(
  handler: H,
  errorCode: string,
  errorMessage: string,
  statusCode: ContentfulStatusCode = 500
): H {
  const wrapped = async (c: Parameters<H>[0]) => {
    try {
      return await handler(c);
    } catch (error) {
      console.error(`${errorMessage}:`, error);
      return jsonError(c, statusCode, errorCode, errorMessage);
    }
  };
  return wrapped as unknown as H;
}
