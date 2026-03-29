import { randomBytes } from "node:crypto";
import { db } from "../../db/index.js";
import { hashValue, normalizeEmail, toSessionUser } from "../auth/auth-utils.js";
import { hashPassword } from "../auth/password-service.js";

const INVITE_TOKEN_BYTES = 32;
const DEFAULT_EXPIRES_DAYS = 7;

export async function createInvitation(input: {
  email: string;
  role?: string;
  groupIds?: string[];
  expiresInDays?: number;
  invitedByUserId: string;
}) {
  const email = normalizeEmail(input.email);
  const role = input.role ?? "member";
  const groupIds = input.groupIds ?? [];
  const expiresInDays = input.expiresInDays ?? DEFAULT_EXPIRES_DAYS;
  const now = new Date();

  // Check if email is already registered
  const existingUser = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();
  if (existingUser) {
    throw new Error("A user with this email already exists");
  }

  // Check for existing non-expired pending invitation
  const existingInvite = await db
    .selectFrom("user_invitations")
    .select("id")
    .where("email", "=", email)
    .where("usedAt", "is", null)
    .where("revokedAt", "is", null)
    .where("expiresAt", ">", now)
    .executeTakeFirst();
  if (existingInvite) {
    throw new Error("An active invitation already exists for this email");
  }

  const token = randomBytes(INVITE_TOKEN_BYTES).toString("hex");
  const tokenHash = hashValue(token);
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

  const id = `inv_${crypto.randomUUID()}`;

  const invitation = await db
    .insertInto("user_invitations")
    .values({
      id,
      email,
      tokenHash: tokenHash,
      role,
      groupIds: groupIds,
      invitedByUserId: input.invitedByUserId,
      expiresAt: expiresAt,
      createdAt: now,
    })
    .returningAll()
    .executeTakeFirst();

  if (!invitation) throw new Error("Failed to create invitation");

  return { invitation, token };
}

export async function listInvitations() {
  const invitations = await db
    .selectFrom("user_invitations")
    .leftJoin("users", "user_invitations.invitedByUserId", "users.id")
    .selectAll("user_invitations")
    .select("users.email as inviter_email")
    .orderBy("user_invitations.createdAt")
    .execute();

  return invitations.map((row) => ({
    ...row,
    invitedByEmail: row.inviter_email,
  }));
}

export async function revokeInvitation(invitationId: string) {
  const updated = await db
    .updateTable("user_invitations")
    .set({ revokedAt: new Date() })
    .where("id", "=", invitationId)
    .where("usedAt", "is", null)
    .where("revokedAt", "is", null)
    .returningAll()
    .executeTakeFirst();

  return updated ?? null;
}

export async function validateInviteToken(token: string) {
  const tokenHash = hashValue(token);
  const row = await db
    .selectFrom("user_invitations")
    .selectAll()
    .where("tokenHash", "=", tokenHash)
    .where("usedAt", "is", null)
    .where("revokedAt", "is", null)
    .executeTakeFirst();

  if (!row) return null;
  if (row.expiresAt < new Date()) return null;

  return row;
}

export async function acceptInvitation(token: string, input: { name: string; password: string }) {
  // Pre-validate outside transaction (fast reject for invalid tokens)
  const preCheck = await validateInviteToken(token);
  if (!preCheck) {
    throw new Error("Invalid or expired invitation");
  }

  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  // Hash password before transaction to keep the transaction short
  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const userId = `user_${crypto.randomUUID()}`;
  const tokenHash = hashValue(token);

  const user = await db.transaction().execute(async (trx) => {
    // Re-validate inside transaction to prevent TOCTOU race
    const invitation = await trx
      .selectFrom("user_invitations")
      .selectAll()
      .where("tokenHash", "=", tokenHash)
      .where("usedAt", "is", null)
      .where("revokedAt", "is", null)
      .executeTakeFirst();

    if (!invitation || invitation.expiresAt < now) {
      throw new Error("Invalid or expired invitation");
    }

    // Mark invitation as used first (prevents concurrent accepts)
    const marked = await trx
      .updateTable("user_invitations")
      .set({ usedAt: now })
      .where("id", "=", invitation.id)
      .where("usedAt", "is", null)
      .returningAll()
      .executeTakeFirst();

    if (!marked) {
      throw new Error("Invalid or expired invitation");
    }

    // Create user
    const created = await trx
      .insertInto("users")
      .values({
        id: userId,
        email: invitation.email,
        name,
        avatarUrl: null,
        emailVerifiedAt: now,
        tokenVersion: 1,
        role: invitation.role,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirst();

    if (!created) throw new Error("Failed to create user");

    // Create password identity
    await trx
      .insertInto("auth_identities")
      .values({
        id: `auth_${crypto.randomUUID()}`,
        userId: created.id,
        provider: "password",
        providerUserId: created.email,
        passwordHash: passwordHash,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    // Add group memberships
    if (invitation.groupIds.length > 0) {
      await trx
        .insertInto("user_group_memberships")
        .values(
          invitation.groupIds.map((groupId) => ({
            id: `ugm_${crypto.randomUUID()}`,
            userId: created.id,
            groupId: groupId,
            addedBy: invitation.invitedByUserId,
            createdAt: now,
          }))
        )
        .execute();
    }

    return created;
  });

  return toSessionUser(user);
}
