// Barrel re-export file for backward compatibility.
// The original monolithic module has been split into focused services:
//   - auth-utils.ts     — shared types, constants, and helper functions
//   - password-service.ts — password hashing, registration, authentication
//   - token-service.ts    — JWT/access token and refresh token management
//   - session-service.ts  — session resolution, listing, and revocation
//   - oauth-service.ts    — Google OAuth flow, identity reconciliation

export type {
  AccessTokenPayload,
  AuthSessionRecord,
  IssuedTokenSet,
  RefreshClientType,
  RefreshResult,
  ResolvedAccessTokenSession,
  SupportedAuthMode,
} from "./auth-utils.js";
export {
  ACCESS_TOKEN_TTL_SECONDS,
  isRegistrationOpen,
  REFRESH_TOKEN_TTL_SECONDS,
} from "./auth-utils.js";
export {
  exchangeGoogleIdToken,
  issueMobileTokenPair,
  reconcileGoogleIdentity,
} from "./oauth-service.js";
export {
  authenticatePasswordUser,
  registerPasswordUser,
  verifyEmailRegistrationToken,
} from "./password-service.js";

export {
  listAuthSessionsForUser,
  resolveAccessTokenSession,
  revokeAuthSessionById,
} from "./session-service.js";
export {
  createSignedAccessToken,
  parseSignedAccessToken,
  refreshAccessToken,
  revokeRefreshToken,
} from "./token-service.js";
