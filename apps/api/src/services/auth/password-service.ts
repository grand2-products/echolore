import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  createUserWithPasswordIdentity,
  findPasswordIdentityByUserId,
  findUserByEmailWithPasswordIdentity,
  findValidEmailVerificationToken,
  processEmailVerification,
} from "../../repositories/auth/auth-repository.js";
import { resolveAllowedDomain } from "../admin/auth-settings-service.js";
import {
  findUserByEmail,
  hashValue,
  isRegistrationOpen,
  normalizeEmail,
  toSessionUser,
} from "./auth-utils.js";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string) {
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

  const existingPasswordIdentity = existingUser
    ? await findPasswordIdentityByUserId(existingUser.id)
    : null;

  if (existingUser?.emailVerifiedAt && existingPasswordIdentity) {
    throw new Error("Password login is already configured for this email address");
  }

  // First user: create admin immediately without email verification
  const user = await createUserWithPasswordIdentity({
    id: `user_${crypto.randomUUID()}`,
    email,
    name,
    passwordHash,
    createdAt: now,
  });

  return { user: toSessionUser(user), immediate: true as const };
}

export async function verifyEmailRegistrationToken(token: string) {
  const tokenHash = hashValue(token);
  const verification = await findValidEmailVerificationToken(tokenHash);

  if (!verification || !verification.pendingPasswordHash) {
    return null;
  }

  const user = await processEmailVerification({
    id: verification.id,
    email: verification.email,
    userId: verification.userId,
    pendingPasswordHash: verification.pendingPasswordHash,
    pendingName: verification.pendingName,
  });

  if (!user) return null;
  return toSessionUser(user);
}

export async function authenticatePasswordUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const record = await findUserByEmailWithPasswordIdentity(normalizedEmail);

  if (!record?.identity.passwordHash || !record.user.emailVerifiedAt) {
    return null;
  }

  const isValid = await verifyPassword(password, record.identity.passwordHash);
  if (!isValid) {
    return null;
  }

  return toSessionUser(record.user);
}
