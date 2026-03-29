import { UserRole } from "@echolore/shared/contracts";
import { sql } from "kysely";
import { db } from "../../db/index.js";
import type { User } from "../../db/schema.js";

export async function findUserByEmailWithPasswordIdentity(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await db
    .selectFrom("auth_identities")
    .innerJoin("users", "auth_identities.user_id", "users.id")
    .select([
      "users.id as user_id",
      "users.email",
      "users.name",
      "users.avatar_url",
      "users.email_verified_at",
      "users.token_version",
      "users.role",
      "users.suspended_at",
      "users.deleted_at as user_deleted_at",
      "users.created_at as user_created_at",
      "users.updated_at as user_updated_at",
      "auth_identities.id as identity_id",
      "auth_identities.user_id as identity_user_id",
      "auth_identities.provider",
      "auth_identities.provider_user_id",
      "auth_identities.password_hash",
      "auth_identities.created_at as identity_created_at",
      "auth_identities.updated_at as identity_updated_at",
    ])
    .where("users.email", "=", normalizedEmail)
    .where("auth_identities.provider", "=", "password")
    .execute();

  if (rows.length === 0) return null;

  // biome-ignore lint/style/noNonNullAssertion: guaranteed by length check above
  const row = rows[0]!;
  return {
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      avatar_url: row.avatar_url,
      email_verified_at: row.email_verified_at,
      token_version: row.token_version,
      role: row.role,
      suspended_at: row.suspended_at,
      deleted_at: row.user_deleted_at,
      created_at: row.user_created_at,
      updated_at: row.user_updated_at,
    },
    identity: {
      id: row.identity_id,
      user_id: row.identity_user_id,
      provider: row.provider,
      provider_user_id: row.provider_user_id,
      password_hash: row.password_hash,
      created_at: row.identity_created_at,
      updated_at: row.identity_updated_at,
    },
  };
}

export async function findPasswordIdentityByUserId(userId: string) {
  return (
    (await db
      .selectFrom("auth_identities")
      .selectAll()
      .where("user_id", "=", userId)
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
        avatar_url: null,
        email_verified_at: input.createdAt,
        token_version: 1,
        role: "admin",
        created_at: input.createdAt,
        updated_at: input.createdAt,
      })
      .returningAll()
      .executeTakeFirst();

    if (!created) throw new Error("Failed to create user");

    await trx
      .insertInto("auth_identities")
      .values({
        id: `auth_${crypto.randomUUID()}`,
        user_id: created.id,
        provider: "password",
        provider_user_id: input.email,
        password_hash: input.passwordHash,
        created_at: input.createdAt,
        updated_at: input.createdAt,
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
        email_verified_at: input.emailVerifiedAt,
        updated_at: input.updatedAt,
      })
      .where("id", "=", input.userId)
      .execute();

    await trx
      .updateTable("auth_identities")
      .set({
        password_hash: input.passwordHash,
        updated_at: input.updatedAt,
      })
      .where("user_id", "=", input.userId)
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
      user_id: input.userId,
      email: input.email,
      token_hash: input.tokenHash,
      purpose: input.purpose,
      pending_password_hash: input.pendingPasswordHash,
      expires_at: input.expiresAt,
      used_at: null,
      created_at: input.createdAt,
    })
    .execute();
}

export async function listAuthRefreshTokens(userId: string) {
  const now = new Date();
  return db
    .selectFrom("auth_refresh_tokens")
    .selectAll()
    .where("user_id", "=", userId)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", now)
    .orderBy("created_at")
    .execute();
}

export async function findAuthRefreshToken(tokenHash: string) {
  const now = new Date();
  return (
    (await db
      .selectFrom("auth_refresh_tokens")
      .selectAll()
      .where("token_hash", "=", tokenHash)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", now)
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
      user_id: input.userId,
      client_type: input.clientType,
      auth_mode: input.authMode,
      device_name: input.deviceName,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      rotated_from_id: input.rotatedFromId,
      revoked_at: null,
      last_seen_at: input.lastSeenAt,
      created_at: input.createdAt,
    })
    .execute();
}

export async function revokeAuthRefreshToken(tokenId: string, revokedAt: Date): Promise<void> {
  await db
    .updateTable("auth_refresh_tokens")
    .set({ revoked_at: revokedAt, last_seen_at: revokedAt })
    .where("id", "=", tokenId)
    .execute();
}

export async function findSuccessorRefreshToken(rotatedFromId: string) {
  return (
    (await db
      .selectFrom("auth_refresh_tokens")
      .selectAll()
      .where("rotated_from_id", "=", rotatedFromId)
      .where("revoked_at", "is", null)
      .executeTakeFirst()) ?? null
  );
}

export async function getAuthRefreshTokenById(tokenId: string) {
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

export async function findGracedRefreshToken(tokenHash: string, graceThreshold: Date) {
  const now = new Date();
  return (
    (await db
      .selectFrom("auth_refresh_tokens")
      .selectAll()
      .where("token_hash", "=", tokenHash)
      .where("revoked_at", ">", graceThreshold)
      .where("expires_at", ">", now)
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
          avatar_url: null,
          email_verified_at: now,
          token_version: 1,
          role: UserRole.Admin,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirst();
    } else {
      const nextName = user.name?.trim() ? user.name : input.name;
      const updatedUser = await trx
        .updateTable("users")
        .set({
          name: nextName,
          email_verified_at: user.email_verified_at ?? now,
          updated_at: now,
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
      .where("provider_user_id", "=", input.email)
      .executeTakeFirst();

    if (!existingIdentity) {
      await trx
        .insertInto("auth_identities")
        .values({
          id: `auth_${crypto.randomUUID()}`,
          user_id: user.id,
          provider: input.provider,
          provider_user_id: input.email,
          password_hash: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
    }

    return user;
  });
}

// ---------------------------------------------------------------------------
// Email verification token
// ---------------------------------------------------------------------------

export async function findValidEmailVerificationToken(tokenHash: string) {
  const now = new Date();
  return (
    (await db
      .selectFrom("email_verification_tokens")
      .selectAll()
      .where("token_hash", "=", tokenHash)
      .where("purpose", "=", "password-registration")
      .where("used_at", "is", null)
      .where("expires_at", ">", now)
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
          avatar_url: null,
          email_verified_at: now,
          token_version: 1,
          role: UserRole.Admin,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirst();
      user = createdUser ?? null;
    } else {
      const updatedUser = await trx
        .updateTable("users")
        .set({
          email_verified_at: user.email_verified_at ?? now,
          updated_at: now,
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
      .where("user_id", "=", user.id)
      .where("provider", "=", "password")
      .executeTakeFirst();

    if (passwordIdentity) {
      await trx
        .updateTable("auth_identities")
        .set({
          password_hash: verification.pendingPasswordHash,
          updated_at: now,
        })
        .where("id", "=", passwordIdentity.id)
        .execute();
    } else {
      await trx
        .insertInto("auth_identities")
        .values({
          id: `auth_${crypto.randomUUID()}`,
          user_id: user.id,
          provider: "password",
          provider_user_id: user.email,
          password_hash: verification.pendingPasswordHash,
          created_at: now,
          updated_at: now,
        })
        .execute();
    }

    await trx
      .updateTable("email_verification_tokens")
      .set({ used_at: now })
      .where("id", "=", verification.id)
      .execute();

    return user;
  });
}
