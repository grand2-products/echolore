import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { UserRole } from "@corp-internal/shared/contracts";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { authIdentities, emailVerificationTokens, users } from "../../db/schema.js";
import { resolveAllowedDomain } from "../admin/auth-settings-service.js";
import {
  PASSWORD_PROVIDER,
  findUserByEmail,
  hashValue,
  isRegistrationOpen,
  normalizeEmail,
  toSessionUser,
} from "./auth-utils.js";

const scrypt = promisify(scryptCallback);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, passwordHash: string) {
  const [salt, storedHash] = passwordHash.split(":");
  if (!salt || !storedHash) return false;
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(storedHash, "hex");
  if (derivedKey.length !== storedBuffer.length) return false;
  return timingSafeEqual(derivedKey, storedBuffer);
}

export async function registerPasswordUser(input: {
  email: string;
  name: string;
  password: string;
}) {
  const isFirstUser = await isRegistrationOpen();
  if (!isFirstUser) {
    throw new Error("Registration is closed");
  }

  const email = normalizeEmail(input.email);
  const allowedDomain = await resolveAllowedDomain();
  if (allowedDomain) {
    const [, emailDomain = ""] = email.split("@");
    if (emailDomain !== allowedDomain) {
      throw new Error("Email domain is not allowed");
    }
  }
  const name = input.name.trim();
  const now = new Date();
  const passwordHash = await hashPassword(input.password);

  if (!name) {
    throw new Error("Name is required");
  }

  const existingUser = await findUserByEmail(email);

  const [existingPasswordIdentity] = existingUser
    ? await db
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.userId, existingUser.id),
            eq(authIdentities.provider, PASSWORD_PROVIDER)
          )
        )
    : [];

  if (existingUser?.emailVerifiedAt && existingPasswordIdentity) {
    throw new Error("Password login is already configured for this email address");
  }

  // First user: create admin immediately without email verification
  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        id: `user_${crypto.randomUUID()}`,
        email,
        name,
        avatarUrl: null,
        emailVerifiedAt: now,
        tokenVersion: 1,
        role: UserRole.Admin,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!created) throw new Error("Failed to create initial admin user");

    await tx.insert(authIdentities).values({
      id: `auth_${crypto.randomUUID()}`,
      userId: created.id,
      provider: PASSWORD_PROVIDER,
      providerUserId: email,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    return created;
  });

  return { user: toSessionUser(user), immediate: true as const };
}

export async function verifyEmailRegistrationToken(token: string) {
  const tokenHash = hashValue(token);
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

  if (!verification || !verification.pendingPasswordHash) {
    return null;
  }

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
          role: UserRole.Admin,
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
      .where(
        and(eq(authIdentities.userId, user.id), eq(authIdentities.provider, PASSWORD_PROVIDER))
      );

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
        provider: PASSWORD_PROVIDER,
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

    return toSessionUser(user);
  });
}

export async function authenticatePasswordUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const rows = await db
    .select({
      user: users,
      identity: authIdentities,
    })
    .from(authIdentities)
    .innerJoin(users, eq(authIdentities.userId, users.id))
    .where(and(eq(users.email, normalizedEmail), eq(authIdentities.provider, PASSWORD_PROVIDER)));

  const record = rows[0];
  if (!record?.identity.passwordHash || !record.user.emailVerifiedAt) {
    return null;
  }

  const isValid = await verifyPassword(password, record.identity.passwordHash);
  if (!isValid) {
    return null;
  }

  return toSessionUser(record.user);
}
