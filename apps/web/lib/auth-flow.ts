import { buildAuthJsUrl } from "./api/fetch";
import { normalizeReturnTo } from "./return-to";

/**
 * Initiate Google OAuth sign-in via POST (required by Auth.js v5).
 *
 * Auth.js v5 requires OAuth provider sign-in to be triggered via POST with a
 * CSRF token. A plain GET link results in an `UnknownAction` error.
 */
export async function initiateGoogleSignIn(returnTo?: string | null) {
  const csrfRes = await fetch(buildAuthJsUrl("/api/auth/csrf"), {
    credentials: "include",
  });
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const form = document.createElement("form");
  form.method = "POST";
  form.action = buildAuthJsUrl("/api/auth/signin/google");
  form.style.display = "none";

  const tokenInput = document.createElement("input");
  tokenInput.type = "hidden";
  tokenInput.name = "csrfToken";
  tokenInput.value = csrfToken;
  form.appendChild(tokenInput);

  const safeReturnTo = normalizeReturnTo(returnTo);
  if (safeReturnTo) {
    const callbackInput = document.createElement("input");
    callbackInput.type = "hidden";
    callbackInput.name = "callbackUrl";
    callbackInput.value = new URL(safeReturnTo, window.location.origin).toString();
    form.appendChild(callbackInput);
  }

  document.body.appendChild(form);
  form.submit();
}

export async function logoutCurrentUser() {
  const csrfRes = await fetch(buildAuthJsUrl("/api/auth/csrf"), {
    credentials: "include",
  });
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const form = document.createElement("form");
  form.method = "POST";
  form.action = buildAuthJsUrl("/api/auth/signout");
  form.style.display = "none";

  const tokenInput = document.createElement("input");
  tokenInput.type = "hidden";
  tokenInput.name = "csrfToken";
  tokenInput.value = csrfToken;
  form.appendChild(tokenInput);

  document.body.appendChild(form);
  form.submit();
}
