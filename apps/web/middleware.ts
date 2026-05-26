import { type NextRequest, NextResponse } from "next/server";

/**
 * Runtime-generated Content-Security-Policy.
 *
 * Why middleware instead of `next.config.ts` `headers()`:
 * `headers()` is evaluated at **build time**, so any `connect-src` entry
 * derived from `ECHOLORE_PUBLIC_API_URL` gets frozen into the image. That
 * breaks the runtime-env pattern (a single pre-built image meant to run
 * against any host/port): the API URL is injected at runtime via `<meta>`
 * tags (see `lib/runtime-env.ts`), but the CSP stayed pinned to whatever
 * port happened to be in the build environment (e.g. a stray dev
 * `apps/web/.env.local` pinned it to :17721 while dogfood serves the API on
 * :17821 — every API fetch was then blocked by CSP).
 *
 * Middleware runs per-request, so we derive `connect-src` from the request's
 * own `Host` header. The browser always talks to the API on the **same
 * hostname** it loaded the app from (see `alignHostname` in `runtime-env.ts`),
 * just on a different port. Allowing that hostname on any port — over both
 * http/ws (dev, dogfood, LAN) and https/wss (production behind TLS) — covers
 * every deployment shape without baking a port into the image.
 */
function buildCsp(host: string): string {
  const hostname = host.split(":")[0] || "localhost";
  // Same hostname, any port, all four schemes. Not a blanket `http:` allow —
  // scoped to the host the page was served from.
  const sameHost = [
    `http://${hostname}:*`,
    `https://${hostname}:*`,
    `ws://${hostname}:*`,
    `wss://${hostname}:*`,
  ].join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' blob: wss: https: ${sameHost}`,
    "media-src 'self' blob:",
    "frame-src 'self'",
  ].join("; ");
}

export function middleware(req: NextRequest): NextResponse {
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", buildCsp(req.headers.get("host") ?? "localhost"));
  return res;
}

export const config = {
  // Skip static assets — they don't need a CSP and middleware adds latency.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
