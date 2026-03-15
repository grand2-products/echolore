import { UserRole } from "@corp-internal/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authIdentities, users } from "../db/schema.js";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
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

function createSelectQueue<T>(items: T[]) {
  return vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(async () => items.shift() ?? []),
    })),
  }));
}

function createTx(options: { selectQueue?: unknown[]; updateQueue?: unknown[] }) {
  const selectQueue = [...(options.selectQueue ?? [])];
  const updateQueue = [...(options.updateQueue ?? [])];
  const inserts: Array<{ table: unknown; values: unknown }> = [];

  return {
    tx: {
      select: createSelectQueue(selectQueue),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => updateQueue.shift() ?? []),
          })),
        })),
      })),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          inserts.push({ table, values });
          return {
            returning: vi.fn(async () => []),
          };
        }),
      })),
    },
    inserts,
  };
}

describe("local-auth identity linking", () => {
  beforeEach(() => {
    dbMock.select.mockReset();
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

    dbMock.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const user = await reconcileGoogleIdentity({
      email: "member@example.com",
      name: "Member",
    });

    expect(user.id).toBe(existingUser.id);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe(authIdentities);
    expect(inserts[0]?.values).toMatchObject({
      userId: existingUser.id,
      provider: "google",
      providerUserId: existingUser.email,
    });
    expect(tx.insert).not.toHaveBeenCalledWith(users);
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

    dbMock.select.mockImplementation(createSelectQueue([[verification]]));
    dbMock.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const user = await verifyEmailRegistrationToken("raw-token");

    expect(user?.id).toBe(existingUser.id);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe(authIdentities);
    expect(inserts[0]?.values).toMatchObject({
      userId: existingUser.id,
      provider: "password",
      providerUserId: existingUser.email,
      passwordHash: verification.pendingPasswordHash,
    });
    expect(tx.insert).not.toHaveBeenCalledWith(users);
  });
});
