import { buildAuthJsUrl } from "./api/fetch";
import { normalizeReturnTo } from "./return-to";

function resolveAuthJsUrl(path: string) {
  if (!process.env.NEXT_PUBLIC_API_URL) {
    return path;
  }
  return buildAuthJsUrl(path);
}

export function getGoogleSignInUrl(returnTo?: string | null) {
  const signInUrl = resolveAuthJsUrl("/api/auth/signin/google");
  const url =
    typeof window !== "undefined"
      ? new URL(signInUrl, window.location.origin)
      : new URL(signInUrl, "http://localhost");

  const safeReturnTo = normalizeReturnTo(returnTo);
  if (safeReturnTo && typeof window !== "undefined") {
    url.searchParams.set("callbackUrl", new URL(safeReturnTo, window.location.origin).toString());
  }

  return url.toString();
}

export async function logoutCurrentUser() {
  window.location.assign(resolveAuthJsUrl("/api/auth/signout"));
}
