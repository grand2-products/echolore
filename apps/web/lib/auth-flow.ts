import { buildAuthJsUrl } from "./api/fetch";
import { normalizeReturnTo } from "./return-to";

export function getGoogleSignInUrl(returnTo?: string | null) {
  const signInUrl = buildAuthJsUrl("/api/auth/signin/google");
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
  window.location.assign(buildAuthJsUrl("/api/auth/signout"));
}
