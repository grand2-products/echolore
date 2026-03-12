import type { AuthMeResponse } from "./api";
import { authApi } from "./api";
import { buildAuthGatewayUrl } from "./auth-gateway";

export function getGoogleSignInUrl() {
  return buildAuthGatewayUrl("/oauth2/start");
}

export function getSsoSignOutUrl() {
  return buildAuthGatewayUrl("/oauth2/sign_out");
}

export async function logoutCurrentUser(
  authMode: AuthMeResponse["authMode"],
  options?: {
    onSignedOut?: () => void | Promise<void>;
  },
) {
  if (authMode === "sso") {
    window.location.assign(getSsoSignOutUrl());
    return;
  }

  await authApi.logout().catch(() => undefined);
  await options?.onSignedOut?.();
}
