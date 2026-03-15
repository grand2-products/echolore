import { createHash } from "node:crypto";
import { UserRole } from "@echolore/shared/contracts";
import { count, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
export const REFRESH_TOKEN_GRACE_SECONDS = 30;
export const PASSWORD_PROVIDER = "password";
export const GOOGLE_PROVIDER = "google";
export const SUPPORTED_AUTH_MODES = ["password", "sso"] as const;
export type SupportedAuthMode = (typeof SUPPORTED_AUTH_MODES)[number];

export type AccessTokenPayload = {
  sub: string;
  ver: number;
  am: SupportedAuthMode;
  exp: number;
};

export type RefreshClientType = "web" | "mobile";

export type IssuedTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export type ResolvedAccessTokenSession = {
  user: SessionUser;
  authMode: SupportedAuthMode;
};

export type AuthSessionRecord = {
  id: string;
  clientType: RefreshClientType;
  authMode: SupportedAuthMode;
  deviceName: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  expiresAt: Date;
  current: boolean;
};

export type RefreshResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  user: SessionUser;
  authMode: SupportedAuthMode;
};

export async function getUserCount() {
  const [row] = await db.select({ value: count() }).from(users);
  return row?.value ?? 0;
}

export async function isRegistrationOpen() {
  return (await getUserCount()) === 0;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is required when password authentication is enabled");
  }
  return secret;
}

export function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function toSessionUser(user: typeof users.$inferSelect): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === UserRole.Admin ? UserRole.Admin : UserRole.Member,
    avatarUrl: user.avatarUrl ?? null,
  };
}

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)));
  return user ?? null;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}
