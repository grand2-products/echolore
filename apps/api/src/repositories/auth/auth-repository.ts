import { and, eq, gt, isNull } from "drizzle-orm";
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
