import type { Context } from "hono";

export function jsonError(
  c: Context,
  status: number,
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
    status as 200
  );
}
