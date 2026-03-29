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
    .where("used_at", "is", null)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", now)
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
      token_hash: tokenHash,
      role,
      group_ids: groupIds,
      invited_by_user_id: input.invitedByUserId,
      expires_at: expiresAt,
      created_at: now,
    })
    .returningAll()
    .executeTakeFirst();

  if (!invitation) throw new Error("Failed to create invitation");

  return { invitation, token };
}

export async function listInvitations() {
  const invitations = await db
    .selectFrom("user_invitations")
    .leftJoin("users", "user_invitations.invited_by_user_id", "users.id")
    .selectAll("user_invitations")
    .select("users.email as inviter_email")
    .orderBy("user_invitations.created_at")
    .execute();

  return invitations.map((row) => ({
    ...row,
    invitedByEmail: row.inviter_email,
  }));
}

export async function revokeInvitation(invitationId: string) {
  const updated = await db
    .updateTable("user_invitations")
    .set({ revoked_at: new Date() })
    .where("id", "=", invitationId)
    .where("used_at", "is", null)
    .where("revoked_at", "is", null)
    .returningAll()
    .executeTakeFirst();

  return updated ?? null;
}

export async function validateInviteToken(token: string) {
  const tokenHash = hashValue(token);
  const row = await db
    .selectFrom("user_invitations")
    .selectAll()
    .where("token_hash", "=", tokenHash)
    .where("used_at", "is", null)
    .where("revoked_at", "is", null)
    .executeTakeFirst();

  if (!row) return null;
  if (row.expires_at < new Date()) return null;

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
      .where("token_hash", "=", tokenHash)
      .where("used_at", "is", null)
      .where("revoked_at", "is", null)
      .executeTakeFirst();

    if (!invitation || invitation.expires_at < now) {
      throw new Error("Invalid or expired invitation");
    }

    // Mark invitation as used first (prevents concurrent accepts)
    const marked = await trx
      .updateTable("user_invitations")
      .set({ used_at: now })
      .where("id", "=", invitation.id)
      .where("used_at", "is", null)
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
        avatar_url: null,
        email_verified_at: now,
        token_version: 1,
        role: invitation.role,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirst();

    if (!created) throw new Error("Failed to create user");

    // Create password identity
    await trx
      .insertInto("auth_identities")
      .values({
        id: `auth_${crypto.randomUUID()}`,
        user_id: created.id,
        provider: "password",
        provider_user_id: created.email,
        password_hash: passwordHash,
        created_at: now,
        updated_at: now,
      })
      .execute();

    // Add group memberships
    if (invitation.group_ids.length > 0) {
      await trx
        .insertInto("user_group_memberships")
        .values(
          invitation.group_ids.map((groupId) => ({
            id: `ugm_${crypto.randomUUID()}`,
            user_id: created.id,
            group_id: groupId,
            added_by: invitation.invited_by_user_id,
            created_at: now,
          }))
        )
        .execute();
    }

    return created;
  });

  return toSessionUser(user);
}
