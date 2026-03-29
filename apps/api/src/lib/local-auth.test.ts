import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    selectFrom: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("../db/index.js", () => ({
  db: dbMock,
}));

vi.mock("./email.js", () => ({
  sendPasswordVerificationEmail: vi.fn(),
}));

const { reconcileGoogleIdentity, verifyEmailRegistrationToken } = await import("./local-auth.js");

function createTx(options: { selectQueue?: unknown[]; updateQueue?: unknown[] }) {
  const selectQueue = [...(options.selectQueue ?? [])];
  const updateQueue = [...(options.updateQueue ?? [])];
  const inserts: Array<{ table: string; values: unknown }> = [];

  return {
    tx: {
      selectFrom: vi.fn(() => ({
        selectAll: vi.fn(() => {
          const makeWhereChain = (): Record<string, unknown> => ({
            where: vi.fn(() => makeWhereChain()),
            executeTakeFirst: vi.fn(async () => {
              const item = selectQueue.shift();
              return Array.isArray(item) ? (item[0] ?? null) : (item ?? null);
            }),
          });
          return makeWhereChain();
        }),
      })),
      updateTable: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returningAll: vi.fn(() => ({
              executeTakeFirst: vi.fn(async () => {
                const item = updateQueue.shift();
                return Array.isArray(item) ? (item[0] ?? null) : (item ?? null);
              }),
            })),
            execute: vi.fn(async () => undefined),
          })),
        })),
      })),
      insertInto: vi.fn((table: string) => ({
        values: vi.fn((values: unknown) => {
          inserts.push({ table, values });
          return {
            returningAll: vi.fn(() => ({
              executeTakeFirst: vi.fn(async () => null),
            })),
            execute: vi.fn(async () => undefined),
          };
        }),
      })),
    },
    inserts,
  };
}

describe("local-auth identity linking", () => {
  beforeEach(() => {
    dbMock.selectFrom.mockReset();
    dbMock.transaction.mockReset();
  });

  it("adds a Google identity to an existing email without creating another user", async () => {
    const existingUser = {
      id: "user_existing",
      email: "member@example.com",
      name: "Member",
      avatarUrl: null,
      emailVerifiedAt: new Date("2026-03-12T00:00:00.000Z"),
      role: UserRole.Member,
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    };
    const { tx, inserts } = createTx({
      selectQueue: [[existingUser], []],
      updateQueue: [[existingUser]],
    });

    dbMock.transaction.mockReturnValue({
      execute: async (callback: (client: typeof tx) => unknown) => callback(tx),
    });

    const user = await reconcileGoogleIdentity({
      email: "member@example.com",
      name: "Member",
    });

    expect(user.id).toBe(existingUser.id);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe("auth_identities");
    expect(inserts[0]?.values).toMatchObject({
      userId: existingUser.id,
      provider: "google",
      providerUserId: existingUser.email,
    });
    expect(tx.insertInto).not.toHaveBeenCalledWith("users");
  });

  it("verifies password registration against an existing email without creating another user", async () => {
    const existingUser = {
      id: "user_existing",
      email: "member@example.com",
      name: "Member",
      avatarUrl: null,
      emailVerifiedAt: new Date("2026-03-12T00:00:00.000Z"),
      role: UserRole.Member,
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    };
    const verification = {
      id: "evt_1",
      userId: null,
      email: existingUser.email,
      tokenHash: "hashed",
      purpose: "password-registration",
      pendingName: null,
      pendingPasswordHash: "salt:hash",
      expiresAt: new Date("2099-03-12T00:30:00.000Z"),
      usedAt: null,
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
    };
    const { tx, inserts } = createTx({
      selectQueue: [[existingUser], []],
      updateQueue: [[existingUser]],
    });

    // Mock db.selectFrom for findValidEmailVerificationToken
    dbMock.selectFrom.mockReturnValue({
      selectAll: vi.fn(() => ({
        where: vi.fn(() => ({
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                executeTakeFirst: vi.fn(async () => verification),
              })),
            })),
          })),
        })),
      })),
    });

    dbMock.transaction.mockReturnValue({
      execute: async (callback: (client: typeof tx) => unknown) => callback(tx),
    });

    const user = await verifyEmailRegistrationToken("raw-token");

    expect(user?.id).toBe(existingUser.id);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe("auth_identities");
    expect(inserts[0]?.values).toMatchObject({
      userId: existingUser.id,
      provider: "password",
      providerUserId: existingUser.email,
      passwordHash: verification.pendingPasswordHash,
    });
    expect(tx.insertInto).not.toHaveBeenCalledWith("users");
  });
});
