const DEFAULT_CORS_ORIGIN = "http://localhost:17760";

let cached: Set<string> | undefined;

/** Parse CORS_ORIGIN env var (comma-separated) into a Set. Cached after first call. */
export function parseCorsOrigins(): Set<string> {
  if (cached) return cached;
  cached = new Set(
    (process.env.CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN).split(",").map((s) => s.trim())
  );
  return cached;
}
