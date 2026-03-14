// Barrel re-export file for backward compatibility.
// The original monolithic module has been split into focused services:
//   - auth-utils.ts     — shared types, constants, and helper functions
//   - password-service.ts — password hashing, registration, authentication
//   - token-service.ts    — JWT/access token and refresh token management
//   - session-service.ts  — session resolution, listing, and revocation
//   - oauth-service.ts    — Google OAuth flow, identity reconciliation

export {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  isRegistrationOpen,
} from "./auth-utils.js";

export type {
  SupportedAuthMode,
  AccessTokenPayload,
  RefreshClientType,
  IssuedTokenSet,
  ResolvedAccessTokenSession,
  AuthSessionRecord,
  RefreshResult,
} from "./auth-utils.js";

export {
  registerPasswordUser,
  verifyEmailRegistrationToken,
  authenticatePasswordUser,
} from "./password-service.js";

export {
  createSignedAccessToken,
  parseSignedAccessToken,
  refreshAccessToken,
  revokeRefreshToken,
} from "./token-service.js";

export {
  resolveAccessTokenSession,
  listAuthSessionsForUser,
  revokeAuthSessionById,
} from "./session-service.js";

export {
  reconcileGoogleIdentity,
  issueMobileTokenPair,
  exchangeGoogleIdToken,
} from "./oauth-service.js";
