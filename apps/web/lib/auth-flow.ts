import { buildAuthJsUrl } from "./api/fetch";
import { normalizeReturnTo } from "./return-to";

/**
 * Returns the form action URL for Google OAuth sign-in (POST).
 */
export function getGoogleSignInAction() {
  return buildAuthJsUrl("/api/auth/signin/google");
}

/**
 * Fetches the Auth.js CSRF token needed for form-based sign-in.
 */
export async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(buildAuthJsUrl("/api/auth/csrf"));
  const data = (await res.json()) as { csrfToken: string };
  return data.csrfToken;
}

/**
 * Build the callbackUrl for the sign-in form.
 */
export function buildCallbackUrl(returnTo?: string | null): string {
  const safeReturnTo = normalizeReturnTo(returnTo);
  if (safeReturnTo && typeof window !== "undefined") {
    return new URL(safeReturnTo, window.location.origin).toString();
  }
  return typeof window !== "undefined" ? window.location.origin : "/";
}

export async function logoutCurrentUser() {
  window.location.assign(buildAuthJsUrl("/api/auth/signout"));
}
