import { and, count, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  authIdentities,
  authRefreshTokens,
  emailVerificationTokens,
  users,
} from "../../db/schema.js";

export async function findUserByEmailWithPasswordIdentity(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await db
    .select({
      user: users,
      identity: authIdentities,
    })
    .from(authIdentities)
    .innerJoin(users, eq(authIdentities.userId, users.id))
    .where(and(eq(users.email, normalizedEmail), eq(authIdentities.provider, "password")));

  return rows[0] ?? null;
}

export async function findPasswordIdentityByUserId(userId: string) {
  const [identity] = await db
    .select()
    .from(authIdentities)
    .where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, "password")));
  return identity ?? null;
}

export async function createUserWithPasswordIdentity(input: {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}): Promise<typeof users.$inferSelect> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
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
      .returning();

    if (!created) throw new Error("Failed to create user");

    await tx.insert(authIdentities).values({
      id: `auth_${crypto.randomUUID()}`,
      userId: created.id,
      provider: "password",
      providerUserId: input.email,
      passwordHash: input.passwordHash,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });

    return created;
  });
}

export async function verifyEmailAndUpdatePassword(input: {
  userId: string;
  passwordHash: string;
  emailVerifiedAt: Date;
  updatedAt: Date;
}): Promise<void> {
  return db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        emailVerifiedAt: input.emailVerifiedAt,
        updatedAt: input.updatedAt,
      })
      .where(eq(users.id, input.userId));

    await tx
      .update(authIdentities)
      .set({
        passwordHash: input.passwordHash,
        updatedAt: input.updatedAt,
      })
      .where(eq(authIdentities.userId, input.userId));
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
  await db.insert(emailVerificationTokens).values({
    id: input.id,
    userId: input.userId,
    email: input.email,
    tokenHash: input.tokenHash,
    purpose: input.purpose,
    pendingPasswordHash: input.pendingPasswordHash,
    expiresAt: input.expiresAt,
    usedAt: null,
    createdAt: input.createdAt,
  });
}

export async function listAuthRefreshTokens(userId: string) {
  const now = new Date();
  return db
    .select()
    .from(authRefreshTokens)
    .where(
      and(
        eq(authRefreshTokens.userId, userId),
        isNull(authRefreshTokens.revokedAt),
        gt(authRefreshTokens.expiresAt, now)
      )
    )
    .orderBy(authRefreshTokens.createdAt);
}

export async function findAuthRefreshToken(tokenHash: string) {
  const now = new Date();
  const [token] = await db
    .select()
    .from(authRefreshTokens)
    .where(
      and(
        eq(authRefreshTokens.tokenHash, tokenHash),
        isNull(authRefreshTokens.revokedAt),
        gt(authRefreshTokens.expiresAt, now)
      )
    );
  return token ?? null;
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
  await db.insert(authRefreshTokens).values({
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
  });
}

export async function revokeAuthRefreshToken(tokenId: string, revokedAt: Date): Promise<void> {
  await db
    .update(authRefreshTokens)
    .set({ revokedAt, lastSeenAt: revokedAt })
    .where(eq(authRefreshTokens.id, tokenId));
}

export async function findSuccessorRefreshToken(rotatedFromId: string) {
  const [token] = await db
    .select()
    .from(authRefreshTokens)
    .where(
      and(eq(authRefreshTokens.rotatedFromId, rotatedFromId), isNull(authRefreshTokens.revokedAt))
    );
  return token ?? null;
}

export async function getAuthRefreshTokenById(tokenId: string) {
  const [token] = await db
    .select()
    .from(authRefreshTokens)
    .where(eq(authRefreshTokens.id, tokenId));
  return token ?? null;
}

// ---------------------------------------------------------------------------
// Graced refresh token (for concurrent-request tolerance)
// ---------------------------------------------------------------------------

export async function findGracedRefreshToken(tokenHash: string, graceThreshold: Date) {
  const now = new Date();
  const [graced] = await db
    .select()
    .from(authRefreshTokens)
    .where(
      and(
        eq(authRefreshTokens.tokenHash, tokenHash),
        gt(authRefreshTokens.revokedAt, graceThreshold),
        gt(authRefreshTokens.expiresAt, now)
      )
    );
  return graced ?? null;
}

// ---------------------------------------------------------------------------
// OAuth identity reconciliation (Google SSO)
// ---------------------------------------------------------------------------

export async function reconcileOAuthIdentity(input: {
  email: string;
  name: string;
  provider: string;
}): Promise<typeof users.$inferSelect> {
  const now = new Date();

  return db.transaction(async (tx) => {
    let [user] = await tx.select().from(users).where(eq(users.email, input.email));

    if (!user) {
      const [countRow] = await tx.select({ value: count() }).from(users);
      if ((countRow?.value ?? 0) !== 0) {
        throw new Error("Registration is closed");
      }
      [user] = await tx
        .insert(users)
        .values({
          id: `user_${crypto.randomUUID()}`,
          email: input.email,
          name: input.name,
          avatarUrl: null,
          emailVerifiedAt: now,
          tokenVersion: 1,
          role: "admin",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    } else {
      const nextName = user.name?.trim() ? user.name : input.name;
      const [updatedUser] = await tx
        .update(users)
        .set({
          name: nextName,
          emailVerifiedAt: user.emailVerifiedAt ?? now,
          updatedAt: now,
        })
        .where(eq(users.id, user.id))
        .returning();
      user = updatedUser ?? user;
    }

    if (!user) {
      throw new Error("Failed to reconcile OAuth identity");
    }

    const [existingIdentity] = await tx
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, input.provider),
          eq(authIdentities.providerUserId, input.email)
        )
      );

    if (!existingIdentity) {
      await tx.insert(authIdentities).values({
        id: `auth_${crypto.randomUUID()}`,
        userId: user.id,
        provider: input.provider,
        providerUserId: input.email,
        passwordHash: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    return user;
  });
}

// ---------------------------------------------------------------------------
// Email verification token
// ---------------------------------------------------------------------------

export async function findValidEmailVerificationToken(tokenHash: string) {
  const now = new Date();
  const [verification] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        eq(emailVerificationTokens.purpose, "password-registration"),
        isNull(emailVerificationTokens.usedAt),
        gt(emailVerificationTokens.expiresAt, now)
      )
    );
  return verification ?? null;
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
}): Promise<typeof users.$inferSelect | null> {
  const now = new Date();

  return db.transaction(async (tx) => {
    let user = verification.userId
      ? ((await tx.select().from(users).where(eq(users.id, verification.userId)))[0] ?? null)
      : null;

    if (!user) {
      user = (await tx.select().from(users).where(eq(users.email, verification.email)))[0] ?? null;
    }

    if (!user) {
      const [countRow] = await tx.select({ value: count() }).from(users);
      const isFirstUser = (countRow?.value ?? 0) === 0;
      if (!isFirstUser) {
        return null;
      }
      const [createdUser] = await tx
        .insert(users)
        .values({
          id: `user_${crypto.randomUUID()}`,
          email: verification.email,
          name: verification.pendingName || verification.email.split("@")[0] || "User",
          avatarUrl: null,
          emailVerifiedAt: now,
          tokenVersion: 1,
          role: "admin",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      user = createdUser ?? null;
    } else {
      const [updatedUser] = await tx
        .update(users)
        .set({
          emailVerifiedAt: user.emailVerifiedAt ?? now,
          updatedAt: now,
        })
        .where(eq(users.id, user.id))
        .returning();
      user = updatedUser ?? user;
    }

    if (!user) {
      throw new Error("Failed to create user during verification");
    }

    const [passwordIdentity] = await tx
      .select()
      .from(authIdentities)
      .where(and(eq(authIdentities.userId, user.id), eq(authIdentities.provider, "password")));

    if (passwordIdentity) {
      await tx
        .update(authIdentities)
        .set({
          passwordHash: verification.pendingPasswordHash,
          updatedAt: now,
        })
        .where(eq(authIdentities.id, passwordIdentity.id));
    } else {
      await tx.insert(authIdentities).values({
        id: `auth_${crypto.randomUUID()}`,
        userId: user.id,
        provider: "password",
        providerUserId: user.email,
        passwordHash: verification.pendingPasswordHash,
        createdAt: now,
        updatedAt: now,
      });
    }

    await tx
      .update(emailVerificationTokens)
      .set({ usedAt: now })
      .where(eq(emailVerificationTokens.id, verification.id));

    return user;
  });
}
