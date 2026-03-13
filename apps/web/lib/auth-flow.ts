import { normalizeReturnTo } from "./return-to";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "";

export function getGoogleSignInUrl(returnTo?: string | null) {
  const url = new URL(`${apiBase}/api/auth/signin/google`);
  const safeReturnTo = normalizeReturnTo(returnTo);
  if (safeReturnTo && typeof window !== "undefined") {
    url.searchParams.set("callbackUrl", new URL(safeReturnTo, window.location.origin).toString());
  }
  return url.toString();
}

export async function logoutCurrentUser() {
  window.location.assign(`${apiBase}/api/auth/signout`);
}
