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
  const entries: [string, string][] = [
    ["NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL ?? ""],
    ["NEXT_PUBLIC_LIVEKIT_URL", process.env.NEXT_PUBLIC_LIVEKIT_URL ?? ""],
  ].filter(([, v]) => v !== "") as [string, string][];

  return (
    <>
      {entries.map(([key, value]) => (
        <meta key={key} name={`echolore-env:${key}`} content={value} />
      ))}
    </>
  );
}
