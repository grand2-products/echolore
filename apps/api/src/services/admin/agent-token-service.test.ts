import { UserRole } from "@echolore/shared/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentToken, User } from "../../db/schema.js";
import {
  AGENT_TOKEN_PREFIX,
  createAgentToken,
  hashAgentTokenSecret,
  resolveAgentToken,
} from "./agent-token-service.js";

const { createAgentTokenRowMock, findActiveAgentTokenByHashMock, touchMock, getUserByIdMock } =
  vi.hoisted(() => ({
    createAgentTokenRowMock: vi.fn(),
    findActiveAgentTokenByHashMock: vi.fn(),
    touchMock: vi.fn(),
    getUserByIdMock: vi.fn(),
  }));

vi.mock("../../repositories/admin/agent-token-repository.js", () => ({
  createAgentTokenRow: createAgentTokenRowMock,
  findActiveAgentTokenByHash: findActiveAgentTokenByHashMock,
  touchAgentTokenLastUsed: vi.fn(async (id: string) => touchMock(id)),
  listAgentTokenRows: vi.fn(),
  revokeAgentTokenRow: vi.fn(),
}));

vi.mock("../../repositories/user/user-repository.js", () => ({
  getUserById: getUserByIdMock,
}));

function dbUser(overrides: Partial<User> = {}): User {
  return {
    id: "admin_1",
    email: "admin@example.com",
    name: "Admin",
    role: UserRole.Admin,
    passwordHash: null,
    avatarUrl: null,
    suspendedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

function tokenRow(overrides: Partial<AgentToken> = {}): AgentToken {
  const now = new Date();
  return {
    id: "agt_1",
    name: "CI agent",
    tokenHash: "hash",
    scopes: ["read"],
    createdByUserId: "admin_1",
    lastUsedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as AgentToken;
}

describe("agent-token-service", () => {
  afterEach(() => {
    createAgentTokenRowMock.mockReset();
    findActiveAgentTokenByHashMock.mockReset();
    touchMock.mockReset();
    getUserByIdMock.mockReset();
  });

  it("creates a token and stores only the hash", async () => {
    createAgentTokenRowMock.mockImplementation(async (input: { name: string; tokenHash: string }) =>
      tokenRow({ ...input })
    );

    const { token, secret } = await createAgentToken({
      name: "CI agent",
      scopes: ["read"],
      createdByUserId: "admin_1",
    });

    expect(secret.startsWith(AGENT_TOKEN_PREFIX)).toBe(true);
    expect(secret.length).toBeGreaterThan(40);
    // The stored hash must be a sha256 of the secret, never the secret itself
    expect(token.tokenHash).toBe(hashAgentTokenSecret(secret));
    expect(createAgentTokenRowMock).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: hashAgentTokenSecret(secret) })
    );
  });

  it("resolves a valid token to its creating user", async () => {
    const secret = `${AGENT_TOKEN_PREFIX}abc`;
    findActiveAgentTokenByHashMock.mockResolvedValue(
      tokenRow({ tokenHash: hashAgentTokenSecret(secret) })
    );
    getUserByIdMock.mockResolvedValue(dbUser());

    const resolved = await resolveAgentToken(secret);

    expect(resolved?.user.id).toBe("admin_1");
    expect(resolved?.user.role).toBe(UserRole.Admin);
    expect(touchMock).toHaveBeenCalledWith("agt_1");
  });

  it("rejects secrets with the wrong prefix", async () => {
    expect(await resolveAgentToken("not_a_token")).toBeNull();
    expect(findActiveAgentTokenByHashMock).not.toHaveBeenCalled();
  });

  it("rejects unknown hashes (revoked or never issued)", async () => {
    findActiveAgentTokenByHashMock.mockResolvedValue(null);
    expect(await resolveAgentToken(`${AGENT_TOKEN_PREFIX}unknown`)).toBeNull();
  });

  it("rejects tokens whose creator is suspended or deleted", async () => {
    findActiveAgentTokenByHashMock.mockResolvedValue(tokenRow());
    getUserByIdMock.mockResolvedValue(dbUser({ suspendedAt: new Date() }));
    expect(await resolveAgentToken(`${AGENT_TOKEN_PREFIX}abc`)).toBeNull();

    getUserByIdMock.mockResolvedValue(null);
    expect(await resolveAgentToken(`${AGENT_TOKEN_PREFIX}abc`)).toBeNull();
  });
});
