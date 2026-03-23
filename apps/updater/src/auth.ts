import { timingSafeEqual } from "node:crypto";

const UPDATER_SECRET = Deno.env.get("UPDATER_SECRET") ?? "";

export function verifySecret(request: Request): boolean {
  if (UPDATER_SECRET.length === 0) return false;

  const provided = request.headers.get("x-echolore-updater-secret")?.trim() ?? "";
  if (provided.length === 0 || provided.length !== UPDATER_SECRET.length) {
    return false;
  }

  return timingSafeEqual(
    new TextEncoder().encode(provided),
    new TextEncoder().encode(UPDATER_SECRET)
  );
}
