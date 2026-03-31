import { UserRole } from "@echolore/shared/contracts";
import { sql } from "kysely";
import { db } from "../../db/index.js";
import type {
  AuthIdentity,
  AuthRefreshToken,
  EmailVerificationToken,
  User,
} from "../../db/schema.js";

export async function findUserByEmailWithPasswordIdentity(email: string): Promise<{
  user: User;
  identity: AuthIdentity;
} | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await db
    .selectFrom("auth_identities")
    .innerJoin("users", "auth_identities.userId", "users.id")
    .select([
      "users.id as userId",
      "users.email",
      "users.name",
      "users.avatarUrl",
      "users.emailVerifiedAt",
      "users.tokenVersion",
      "users.role",
      "users.suspendedAt",
      "users.deletedAt as userDeletedAt",
      "users.createdAt as userCreatedAt",
      "users.updatedAt as userUpdatedAt",
      "auth_identities.id as identityId",
      "auth_identities.userId as identityUserId",
      "auth_identities.provider",
      "auth_identities.providerUserId",
      "auth_identities.passwordHash",
      "auth_identities.createdAt as identityCreatedAt",
      "auth_identities.updatedAt as identityUpdatedAt",
    ])
    .where("users.email", "=", normalizedEmail)
    .where("auth_identities.provider", "=", "password")
    .execute();

  if (rows.length === 0) return null;

  // biome-ignore lint/style/noNonNullAssertion: guaranteed by length check above
  const row = rows[0]!;
  return {
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatarUrl,
      emailVerifiedAt: row.emailVerifiedAt,
      tokenVersion: row.tokenVersion,
      role: row.role,
      suspendedAt: row.suspendedAt,
      deletedAt: row.userDeletedAt,
      createdAt: row.userCreatedAt,
      updatedAt: row.userUpdatedAt,
    },
    identity: {
      id: row.identityId,
      userId: row.identityUserId,
      provider: row.provider,
      providerUserId: row.providerUserId,
      passwordHash: row.passwordHash,
      createdAt: row.identityCreatedAt,
      updatedAt: row.identityUpdatedAt,
    },
  };
}

export async function findPasswordIdentityByUserId(userId: string): Promise<AuthIdentity | null> {
  return (
    (await db
      .selectFrom("auth_identities")
      .selectAll()
      .where("userId", "=", userId)
      .where("provider", "=", "password")
      .executeTakeFirst()) ?? null
  );
}

export async function createUserWithPasswordIdentity(input: {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}): Promise<User> {
  return db.transaction().execute(async (trx) => {
    const created = await trx
      .insertInto("users")
      .values({
        id: input.id,
        email: input.email,
        name: input.name,
        avatarUrl: null,
        emailVerifiedAt: input.createdAt,
        tokenVersion: 1,
        role: "admin",
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      })
      .returningAll()
      .executeTakeFirst();

    if (!created) throw new Error("Failed to create user");

    await trx
      .insertInto("auth_identities")
      .values({
        id: `auth_${crypto.randomUUID()}`,
        userId: created.id,
        provider: "password",
        providerUserId: input.email,
        passwordHash: input.passwordHash,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      })
      .execute();

    return created;
  });
}

export async function verifyEmailAndUpdatePassword(input: {
  userId: string;
  passwordHash: string;
  emailVerifiedAt: Date;
  updatedAt: Date;
}): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("users")
      .set({
        emailVerifiedAt: input.emailVerifiedAt,
        updatedAt: input.updatedAt,
      })
      .where("id", "=", input.userId)
      .execute();

    await trx
      .updateTable("auth_identities")
      .set({
        passwordHash: input.passwordHash,
        updatedAt: input.updatedAt,
      })
      .where("userId", "=", input.userId)
      .execute();
  });
}

export async function createEmailVerificationToken(input: {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  purpose: string;
  pendingPasswordHash: string;
  expiresAt: Date;
  createdAt: Date;
}): Promise<void> {
  await db
    .insertInto("email_verification_tokens")
    .values({
      id: input.id,
      userId: input.userId,
      email: input.email,
      tokenHash: input.tokenHash,
      purpose: input.purpose,
      pendingPasswordHash: input.pendingPasswordHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: input.createdAt,
    })
    .execute();
}

export async function listAuthRefreshTokens(userId: string): Promise<AuthRefreshToken[]> {
  const now = new Date();
  return db
    .selectFrom("auth_refresh_tokens")
    .selectAll()
    .where("userId", "=", userId)
    .where("revokedAt", "is", null)
    .where("expiresAt", ">", now)
    .orderBy("createdAt")
    .execute();
}

export async function findAuthRefreshToken(tokenHash: string): Promise<AuthRefreshToken | null> {
  const now = new Date();
  return (
    (await db
      .selectFrom("auth_refresh_tokens")
      .selectAll()
      .where("tokenHash", "=", tokenHash)
      .where("revokedAt", "is", null)
      .where("expiresAt", ">", now)
      .executeTakeFirst()) ?? null
  );
}

export async function createAuthRefreshToken(input: {
  id: string;
  userId: string;
  clientType: string;
  authMode: string;
  deviceName: string | null;
  tokenHash: string;
  expiresAt: Date;
  rotatedFromId: string | null;
  lastSeenAt: Date;
  createdAt: Date;
}): Promise<void> {
  await db
    .insertInto("auth_refresh_tokens")
    .values({
      id: input.id,
      userId: input.userId,
      clientType: input.clientType,
      authMode: input.authMode,
      deviceName: input.deviceName,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      rotatedFromId: input.rotatedFromId,
      revokedAt: null,
      lastSeenAt: input.lastSeenAt,
      createdAt: input.createdAt,
    })
    .execute();
}

export async function revokeAuthRefreshToken(tokenId: string, revokedAt: Date): Promise<void> {
  await db
    .updateTable("auth_refresh_tokens")
    .set({ revokedAt: revokedAt, lastSeenAt: revokedAt })
    .where("id", "=", tokenId)
    .execute();
}

export async function findSuccessorRefreshToken(
  rotatedFromId: string
): Promise<AuthRefreshToken | null> {
  return (
    (await db
      .selectFrom("auth_refresh_tokens")
      .selectAll()
      .where("rotatedFromId", "=", rotatedFromId)
      .where("revokedAt", "is", null)
      .executeTakeFirst()) ?? null
  );
}

export async function getAuthRefreshTokenById(tokenId: string): Promise<AuthRefreshToken | null> {
  return (
    (await db
      .selectFrom("auth_refresh_tokens")
      .selectAll()
      .where("id", "=", tokenId)
      .executeTakeFirst()) ?? null
  );
}

// ---------------------------------------------------------------------------
// Graced refresh token (for concurrent-request tolerance)
// ---------------------------------------------------------------------------

export async function findGracedRefreshToken(
  tokenHash: string,
  graceThreshold: Date
): Promise<AuthRefreshToken | null> {
  const now = new Date();
  return (
    (await db
      .selectFrom("auth_refresh_tokens")
      .selectAll()
      .where("tokenHash", "=", tokenHash)
      .where("revokedAt", ">", graceThreshold)
      .where("expiresAt", ">", now)
      .executeTakeFirst()) ?? null
  );
}

// ---------------------------------------------------------------------------
// OAuth identity reconciliation (Google SSO)
// ---------------------------------------------------------------------------

export async function reconcileOAuthIdentity(input: {
  email: string;
  name: string;
  provider: string;
}): Promise<User> {
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    let user = await trx
      .selectFrom("users")
      .selectAll()
      .where("email", "=", input.email)
      .executeTakeFirst();

    if (!user) {
      const countRow = await trx
        .selectFrom("users")
        .select(sql<number>`count(*)`.as("value"))
        .executeTakeFirst();
      if ((countRow?.value ?? 0) !== 0) {
        throw new Error("Registration is closed");
      }
      user = await trx
        .insertInto("users")
        .values({
          id: `user_${crypto.randomUUID()}`,
          email: input.email,
          name: input.name,
          avatarUrl: null,
          emailVerifiedAt: now,
          tokenVersion: 1,
          role: UserRole.Admin,
          createdAt: now,
          updatedAt: now,
        })
        .returningAll()
        .executeTakeFirst();
    } else {
      const nextName = user.name?.trim() ? user.name : input.name;
      const updatedUser = await trx
        .updateTable("users")
        .set({
          name: nextName,
          emailVerifiedAt: user.emailVerifiedAt ?? now,
          updatedAt: now,
        })
        .where("id", "=", user.id)
        .returningAll()
        .executeTakeFirst();
      user = updatedUser ?? user;
    }

    if (!user) {
      throw new Error("Failed to reconcile OAuth identity");
    }

    const existingIdentity = await trx
      .selectFrom("auth_identities")
      .selectAll()
      .where("provider", "=", input.provider)
      .where("providerUserId", "=", input.email)
      .executeTakeFirst();

    if (!existingIdentity) {
      await trx
        .insertInto("auth_identities")
        .values({
          id: `auth_${crypto.randomUUID()}`,
          userId: user.id,
          provider: input.provider,
          providerUserId: input.email,
          passwordHash: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    return user;
  });
}

// ---------------------------------------------------------------------------
// Email verification token
// ---------------------------------------------------------------------------

export async function findValidEmailVerificationToken(
  tokenHash: string
): Promise<EmailVerificationToken | null> {
  const now = new Date();
  return (
    (await db
      .selectFrom("email_verification_tokens")
      .selectAll()
      .where("tokenHash", "=", tokenHash)
      .where("purpose", "=", "password-registration")
      .where("usedAt", "is", null)
      .where("expiresAt", ">", now)
      .executeTakeFirst()) ?? null
  );
}

// ---------------------------------------------------------------------------
// Email verification: create/update user + identity + mark token used
// ---------------------------------------------------------------------------

export async function processEmailVerification(verification: {
  id: string;
  email: string;
  userId: string | null;
  pendingPasswordHash: string;
  pendingName: string | null;
}): Promise<User | null> {
  const now = new Date();

  return db.transaction().execute(async (trx) => {
    let user = verification.userId
      ? ((await trx
          .selectFrom("users")
          .selectAll()
          .where("id", "=", verification.userId)
          .executeTakeFirst()) ?? null)
      : null;

    if (!user) {
      user =
        (await trx
          .selectFrom("users")
          .selectAll()
          .where("email", "=", verification.email)
          .executeTakeFirst()) ?? null;
    }

    if (!user) {
      const countRow = await trx
        .selectFrom("users")
        .select(sql<number>`count(*)`.as("value"))
        .executeTakeFirst();
      const isFirstUser = (countRow?.value ?? 0) === 0;
      if (!isFirstUser) {
        return null;
      }
      const createdUser = await trx
        .insertInto("users")
        .values({
          id: `user_${crypto.randomUUID()}`,
          email: verification.email,
          name: verification.pendingName || verification.email.split("@")[0] || "User",
          avatarUrl: null,
          emailVerifiedAt: now,
          tokenVersion: 1,
          role: UserRole.Admin,
          createdAt: now,
          updatedAt: now,
        })
        .returningAll()
        .executeTakeFirst();
      user = createdUser ?? null;
    } else {
      const updatedUser = await trx
        .updateTable("users")
        .set({
          emailVerifiedAt: user.emailVerifiedAt ?? now,
          updatedAt: now,
        })
        .where("id", "=", user.id)
        .returningAll()
        .executeTakeFirst();
      user = updatedUser ?? user;
    }

    if (!user) {
      throw new Error("Failed to create user during verification");
    }

    const passwordIdentity = await trx
      .selectFrom("auth_identities")
      .selectAll()
      .where("userId", "=", user.id)
      .where("provider", "=", "password")
      .executeTakeFirst();

    if (passwordIdentity) {
      await trx
        .updateTable("auth_identities")
        .set({
          passwordHash: verification.pendingPasswordHash,
          updatedAt: now,
        })
        .where("id", "=", passwordIdentity.id)
        .execute();
    } else {
      await trx
        .insertInto("auth_identities")
        .values({
          id: `auth_${crypto.randomUUID()}`,
          userId: user.id,
          provider: "password",
          providerUserId: user.email,
          passwordHash: verification.pendingPasswordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    await trx
      .updateTable("email_verification_tokens")
      .set({ usedAt: now })
      .where("id", "=", verification.id)
      .execute();

    return user;
  });
}
