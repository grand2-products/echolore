import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  authenticatePasswordUser,
  exchangeGoogleIdToken,
  getPasswordSessionUser,
  issueMobileTokenPair,
  issuePasswordWebTokenSet,
  listAuthSessionsForUser,
  reconcileGoogleIdentity,
  refreshAccessToken,
  registerPasswordUser,
  resolveAccessTokenSession,
  revokeAuthSessionById,
  revokeRefreshToken,
  verifyEmailRegistrationToken,
} from "../services/auth/password-auth-service.js";

const ACCESS_COOKIE_NAME = "corp_internal_access";
const REFRESH_COOKIE_NAME = "corp_internal_refresh";

type IssuedTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export {
  authenticatePasswordUser,
  exchangeGoogleIdToken,
  getPasswordSessionUser,
  issueMobileTokenPair,
  reconcileGoogleIdentity,
  listAuthSessionsForUser,
  refreshAccessToken,
  registerPasswordUser,
  resolveAccessTokenSession,
  revokeAuthSessionById,
  revokeRefreshToken,
  verifyEmailRegistrationToken,
};

export async function issuePasswordWebSession(c: Context, userId: string) {
  const tokenSet = await issuePasswordWebTokenSet(userId);
  setPasswordSessionCookies(c, tokenSet);
  return { expiresAt: tokenSet.expiresAt };
}

export const issuePasswordSessionCookie = issuePasswordWebSession;

export function setPasswordSessionCookies(c: Context, tokens: IssuedTokenSet) {
  setCookie(c, ACCESS_COOKIE_NAME, tokens.accessToken, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
  setCookie(c, REFRESH_COOKIE_NAME, tokens.refreshToken, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function clearPasswordSessionCookies(c: Context) {
  deleteCookie(c, ACCESS_COOKIE_NAME, { path: "/" });
  deleteCookie(c, REFRESH_COOKIE_NAME, { path: "/" });
}

export const clearPasswordSessionCookie = clearPasswordSessionCookies;

export async function getLocalSessionUser(c: Context) {
  return getPasswordSessionUser({ accessToken: getAccessTokenFromCookie(c) });
}

export function getAccessTokenFromCookie(c: Context) {
  return getCookie(c, ACCESS_COOKIE_NAME) ?? null;
}

export function getRefreshTokenFromCookie(c: Context) {
  return getCookie(c, REFRESH_COOKIE_NAME) ?? null;
}
