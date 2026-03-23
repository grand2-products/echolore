/**
 * Runtime environment variables for client-side code.
 *
 * `NEXT_PUBLIC_*` env vars are inlined at build time by Next.js and cannot
 * carry runtime values in pre-built Docker images. Instead we use
 * `ECHOLORE_PUBLIC_*` env vars which the root layout (a Server Component)
 * injects as `<meta>` tags. Client code reads from there, falling back to
 * the build-time `NEXT_PUBLIC_*` value (for local dev) and finally to a
 * sensible default.
 *
 * The server-side injection is in `components/RuntimeEnvScript.tsx`.
 */

const META_PREFIX = "echolore-env:";

/** Read a runtime env value from `<meta>` tags injected by the server. */
function readMeta(key: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return (
    document.querySelector<HTMLMetaElement>(`meta[name="${META_PREFIX}${key}"]`)?.content ||
    undefined
  );
}

/** Cache so we only query the DOM once per key. */
const cache = new Map<string, string | undefined>();

function read(key: string): string | undefined {
  if (cache.has(key)) return cache.get(key);
  const value = readMeta(key);
  cache.set(key, value);
  return value;
}

/**
 * Resolved API base URL (e.g. `https://example.com`).
 * Falls back to browser origin when unset (same-origin Traefik routing).
 */
export function getPublicApiUrl(): string {
  const runtime = read("ECHOLORE_PUBLIC_API_URL");
  if (runtime) return runtime;

  // Build-time value (works in local dev where .env.local is present)
  const buildTime = process.env.NEXT_PUBLIC_API_URL;
  if (buildTime) return buildTime;

  // Same-origin fallback for pre-built images behind a reverse proxy
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3001";
}

/**
 * Resolved LiveKit WebSocket URL (e.g. `wss://example.com`).
 */
export function getPublicLivekitUrl(): string {
  const runtime = read("ECHOLORE_PUBLIC_LIVEKIT_URL");
  if (runtime) return runtime;

  const buildTime = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (buildTime) return buildTime;

  return "ws://localhost:7880";
}
