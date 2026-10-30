import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OAuthAuthorizationCode, OAuthClient, OAuthRefreshToken } from "../../db/schema.js";
import {
  exchangeAuthorizationCode,
  isValidRedirectUri,
  parseScopeParam,
  pkceS256Challenge,
  refreshAccessToken,
  registerOAuthClient,
  validateAuthorizeRequest,
} from "./mcp-oauth-service.js";

const {
  createOAuthClientRowMock,
  findOAuthClientByIdMock,
  createAuthorizationCodeRowMock,
  findUnconsumedCodeMock,
  consumeCodeMock,
  createRefreshTokenRowMock,
  findActiveRefreshTokenByHashMock,
  revokeRefreshTokenRowMock,
  findAgentTokenByIdMock,
  createAgentTokenMock,
  rotateAgentTokenSecretMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  createOAuthClientRowMock: vi.fn(),
  findOAuthClientByIdMock: vi.fn(),
  createAuthorizationCodeRowMock: vi.fn(),
  findUnconsumedCodeMock: vi.fn(),
  consumeCodeMock: vi.fn(),
  createRefreshTokenRowMock: vi.fn(),
  findActiveRefreshTokenByHashMock: vi.fn(),
  revokeRefreshTokenRowMock: vi.fn(),
  findAgentTokenByIdMock: vi.fn(),
  createAgentTokenMock: vi.fn(),
  rotateAgentTokenSecretMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("../../repositories/auth/oauth-repository.js", () => ({
  createOAuthClientRow: createOAuthClientRowMock,
  findOAuthClientById: findOAuthClientByIdMock,
  createAuthorizationCodeRow: createAuthorizationCodeRowMock,
  findUnconsumedAuthorizationCodeByHash: findUnconsumedCodeMock,
  consumeAuthorizationCodeRow: consumeCodeMock,
  createRefreshTokenRow: createRefreshTokenRowMock,
  findActiveRefreshTokenByHash: findActiveRefreshTokenByHashMock,
  revokeRefreshTokenRow: revokeRefreshTokenRowMock,
}));

vi.mock("../../repositories/admin/agent-token-repository.js", () => ({
  findAgentTokenById: findAgentTokenByIdMock,
}));

vi.mock("../admin/agent-token-service.js", () => ({
  hashAgentTokenSecret: (secret: string) => createHash("sha256").update(secret).digest("hex"),
  createAgentToken: createAgentTokenMock,
  rotateAgentTokenSecret: rotateAgentTokenSecretMock,
}));

vi.mock("../../lib/audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
}));

function clientRow(overrides: Partial<OAuthClient> = {}): OAuthClient {
  return {
    id: "ech_cli_1",
    clientName: "ChatGPT connector",
    redirectUris: ["https://chatgpt.com/callback"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as OAuthClient;
}

function codeRow(overrides: Partial<OAuthAuthorizationCode> = {}): OAuthAuthorizationCode {
  return {
    id: "oac_1",
    codeHash: "hash",
    clientId: "ech_cli_1",
    userId: "admin_1",
    redirectUri: "https://chatgpt.com/callback",
    scopes: ["read"],
    codeChallenge: "challenge",
    codeChallengeMethod: "S256",
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as OAuthAuthorizationCode;
}

function refreshRow(overrides: Partial<OAuthRefreshToken> = {}): OAuthRefreshToken {
  return {
    id: "ort_1",
    tokenHash: "hash",
    agentTokenId: "agt_1",
    clientId: "ech_cli_1",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as OAuthRefreshToken;
}

const VERIFIER = "a".repeat(64);
const CHALLENGE = pkceS256Challenge(VERIFIER);

describe("oauth-service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("redirect uri validation", () => {
    it("accepts https and loopback http URIs", () => {
      expect(isValidRedirectUri("https://chatgpt.com/callback")).toBe(true);
      expect(isValidRedirectUri("http://127.0.0.1:3000/cb")).toBe(true);
      expect(isValidRedirectUri("http://localhost:3000/cb")).toBe(true);
    });

    it("rejects plain http on non-loopback hosts and malformed URIs", () => {
      expect(isValidRedirectUri("http://evil.example.com/cb")).toBe(false);
      expect(isValidRedirectUri("javascript:alert(1)")).toBe(false);
      expect(isValidRedirectUri("https://x.com/cb#fragment")).toBe(false);
      expect(isValidRedirectUri("not a url")).toBe(false);
    });
  });

  describe("scope parsing", () => {
    it("accepts read/write/reporting and defaults to empty (read by caller)", () => {
      expect(parseScopeParam("read write")).toEqual(["read", "write"]);
      expect(parseScopeParam("read reporting")).toEqual(["read", "reporting"]);
      expect(parseScopeParam("read read")).toEqual(["read"]);
      expect(parseScopeParam(undefined)).toEqual([]);
    });

    it("rejects unknown scopes", () => {
      expect(parseScopeParam("read admin")).toBeNull();
    });
  });

  describe("client registration", () => {
    it("stores the client and audits the registration", async () => {
      createOAuthClientRowMock.mockResolvedValue(clientRow());
      const client = await registerOAuthClient({
        clientName: "ChatGPT connector",
        redirectUris: ["https://chatgpt.com/callback"],
      });
      expect(client.id).toBe("ech_cli_1");
      expect(writeAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: "oauth.client.registered", resourceId: "ech_cli_1" })
      );
    });
  });

  describe("authorize request validation", () => {
    it("accepts a valid PKCE authorization request", async () => {
      findOAuthClientByIdMock.mockResolvedValue(clientRow());
      const result = await validateAuthorizeRequest({
        clientId: "ech_cli_1",
        redirectUri: "https://chatgpt.com/callback",
        responseType: "code",
        scope: "read write",
        state: "s1",
        codeChallenge: CHALLENGE,
        codeChallengeMethod: "S256",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scopes).toEqual(["read", "write"]);
        expect(result.value.state).toBe("s1");
      }
    });

    it("refuses to redirect for unregistered redirect_uri", async () => {
      findOAuthClientByIdMock.mockResolvedValue(clientRow());
      const result = await validateAuthorizeRequest({
        clientId: "ech_cli_1",
        redirectUri: "https://evil.example.com/cb",
        responseType: "code",
        scope: "read",
        state: undefined,
        codeChallenge: CHALLENGE,
        codeChallengeMethod: "S256",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.redirectSafe).toBe(false);
    });

    it("rejects missing PKCE challenge as a redirectable error", async () => {
      findOAuthClientByIdMock.mockResolvedValue(clientRow());
      const result = await validateAuthorizeRequest({
        clientId: "ech_cli_1",
        redirectUri: "https://chatgpt.com/callback",
        responseType: "code",
        scope: "read",
        state: undefined,
        codeChallenge: undefined,
        codeChallengeMethod: undefined,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.redirectSafe).toBe(true);
        expect(result.error.code).toBe("invalid_request");
      }
    });
  });

  describe("authorization code exchange", () => {
    it("exchanges a valid code+verifier for tokens", async () => {
      findOAuthClientByIdMock.mockResolvedValue(clientRow());
      const code = "ech_oac_valid";
      findUnconsumedCodeMock.mockResolvedValue(
        codeRow({ codeChallenge: CHALLENGE, scopes: ["read", "write"] })
      );
      createAgentTokenMock.mockResolvedValue({
        token: { id: "agt_9", scopes: ["read", "write"] },
        secret: "ech_agt_new",
      });
      createRefreshTokenRowMock.mockResolvedValue(refreshRow());

      const grant = await exchangeAuthorizationCode({
        clientId: "ech_cli_1",
        code,
        redirectUri: "https://chatgpt.com/callback",
        codeVerifier: VERIFIER,
      });

      expect(grant.accessToken).toBe("ech_agt_new");
      expect(grant.scopes).toEqual(["read", "write"]);
      expect(grant.refreshToken.startsWith("ech_rtk_")).toBe(true);
      expect(consumeCodeMock).toHaveBeenCalledWith("oac_1");
      expect(createAgentTokenMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "ChatGPT connector",
          createdByUserId: "admin_1",
          expiresInDays: 30,
        })
      );
    });

    it("consumes and rejects a code with wrong PKCE verifier", async () => {
      findOAuthClientByIdMock.mockResolvedValue(clientRow());
      findUnconsumedCodeMock.mockResolvedValue(codeRow({ codeChallenge: CHALLENGE }));

      await expect(
        exchangeAuthorizationCode({
          clientId: "ech_cli_1",
          code: "ech_oac_valid",
          redirectUri: "https://chatgpt.com/callback",
          codeVerifier: "b".repeat(64),
        })
      ).rejects.toMatchObject({ code: "invalid_grant" });
      expect(consumeCodeMock).toHaveBeenCalled();
    });

    it("rejects codes issued to another client", async () => {
      findOAuthClientByIdMock.mockResolvedValue(clientRow());
      findUnconsumedCodeMock.mockResolvedValue(
        codeRow({ clientId: "ech_cli_other", codeChallenge: CHALLENGE })
      );
      await expect(
        exchangeAuthorizationCode({
          clientId: "ech_cli_1",
          code: "ech_oac_valid",
          redirectUri: "https://chatgpt.com/callback",
          codeVerifier: VERIFIER,
        })
      ).rejects.toMatchObject({ code: "invalid_grant" });
    });
  });

  describe("refresh token rotation", () => {
    it("rotates the access token and refresh token", async () => {
      findOAuthClientByIdMock.mockResolvedValue(clientRow());
      const refresh = refreshRow();
      findActiveRefreshTokenByHashMock.mockResolvedValue(refresh);
      findAgentTokenByIdMock.mockResolvedValue({
        id: "agt_1",
        scopes: ["read", "write"],
        revokedAt: null,
        createdByUserId: "admin_1",
      });
      rotateAgentTokenSecretMock.mockResolvedValue({
        token: { id: "agt_1" },
        secret: "ech_agt_rotated",
      });
      createRefreshTokenRowMock.mockResolvedValue(refreshRow());

      const grant = await refreshAccessToken({
        clientId: "ech_cli_1",
        refreshToken: "ech_rtk_valid",
      });

      expect(grant.accessToken).toBe("ech_agt_rotated");
      expect(revokeRefreshTokenRowMock).toHaveBeenCalledWith("ort_1");
      expect(rotateAgentTokenSecretMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "agt_1" })
      );
      expect(writeAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: "oauth.token.refreshed" })
      );
    });

    it("rejects refresh for a revoked agent token and revokes the refresh token", async () => {
      findOAuthClientByIdMock.mockResolvedValue(clientRow());
      findActiveRefreshTokenByHashMock.mockResolvedValue(refreshRow());
      findAgentTokenByIdMock.mockResolvedValue({
        id: "agt_1",
        scopes: ["read"],
        revokedAt: new Date(),
        createdByUserId: "admin_1",
      });

      await expect(
        refreshAccessToken({ clientId: "ech_cli_1", refreshToken: "ech_rtk_valid" })
      ).rejects.toMatchObject({ code: "invalid_grant" });
      expect(revokeRefreshTokenRowMock).toHaveBeenCalledWith("ort_1");
    });

    it("rejects unknown refresh tokens", async () => {
      findOAuthClientByIdMock.mockResolvedValue(clientRow());
      findActiveRefreshTokenByHashMock.mockResolvedValue(null);
      await expect(
        refreshAccessToken({ clientId: "ech_cli_1", refreshToken: "ech_rtk_unknown" })
      ).rejects.toMatchObject({ code: "invalid_grant" });
    });
  });
});
