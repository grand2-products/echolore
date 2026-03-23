/**
 * Server Component that injects runtime environment variables into the page
 * via `<meta>` tags.
 *
 * Because this runs on the server, `process.env` reads the actual runtime
 * values — not the build-time inlined ones. Client code reads these via
 * `window.__ECHOLORE_ENV` (see `lib/runtime-env.ts`).
 *
 * Uses `<meta>` instead of `<script>` to avoid React 19's client-side
 * rendering warning for inline scripts.
 */
export function RuntimeEnvMeta() {
  // ECHOLORE_PUBLIC_* are true runtime env vars — NOT inlined at build time
  // like NEXT_PUBLIC_* would be. Server Components read them here and inject
  // them as <meta> tags for client-side code (see lib/runtime-env.ts).
  const entries: [string, string][] = [
    ["ECHOLORE_PUBLIC_API_URL", process.env.ECHOLORE_PUBLIC_API_URL ?? ""],
    ["ECHOLORE_PUBLIC_LIVEKIT_URL", process.env.ECHOLORE_PUBLIC_LIVEKIT_URL ?? ""],
  ].filter(([, v]) => v !== "") as [string, string][];

  return (
    <>
      {entries.map(([key, value]) => (
        <meta key={key} name={`echolore-env:${key}`} content={value} />
      ))}
    </>
  );
}
