import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  const inserts: Array<{ table: string; values: unknown }> = [];

  return {
    tx: {
      selectFrom: vi.fn(() => ({
        selectAll: vi.fn(() => ({
          where: vi.fn(() => ({
            executeTakeFirst: vi.fn(async () => {
              const item = selectQueue.shift();
              return Array.isArray(item) ? (item[0] ?? null) : (item ?? null);
            }),
          })),
        })),
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
    dbMock.select.mockReset();
    dbMock.transaction.mockReset();
  });

  it("adds a Google identity to an existing email without creating another user", async () => {
    const existingUser = {
      id: "user_existing",
      email: "member@example.com",
      name: "Member",
      avatar_url: null,
      email_verified_at: new Date("2026-03-12T00:00:00.000Z"),
      role: UserRole.Member,
      created_at: new Date("2026-03-12T00:00:00.000Z"),
      updated_at: new Date("2026-03-12T00:00:00.000Z"),
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
    expect(inserts[0]?.table).toBe("auth_identities");
    expect(inserts[0]?.values).toMatchObject({
      user_id: existingUser.id,
      provider: "google",
      provider_user_id: existingUser.email,
    });
    expect(tx.insertInto).not.toHaveBeenCalledWith("users");
  });

  it("verifies password registration against an existing email without creating another user", async () => {
    const existingUser = {
      id: "user_existing",
      email: "member@example.com",
      name: "Member",
      avatar_url: null,
      email_verified_at: new Date("2026-03-12T00:00:00.000Z"),
      role: UserRole.Member,
      created_at: new Date("2026-03-12T00:00:00.000Z"),
      updated_at: new Date("2026-03-12T00:00:00.000Z"),
    };
    const verification = {
      id: "evt_1",
      user_id: null,
      email: existingUser.email,
      token_hash: "hashed",
      purpose: "password-registration",
      pending_name: null,
      pending_password_hash: "salt:hash",
      expires_at: new Date("2099-03-12T00:30:00.000Z"),
      used_at: null,
      created_at: new Date("2026-03-12T00:00:00.000Z"),
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
    expect(inserts[0]?.table).toBe("auth_identities");
    expect(inserts[0]?.values).toMatchObject({
      user_id: existingUser.id,
      provider: "password",
      provider_user_id: existingUser.email,
      password_hash: verification.pending_password_hash,
    });
    expect(tx.insertInto).not.toHaveBeenCalledWith("users");
  });
});
