import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { authIdentities, userGroupMemberships, userInvitations, users } from "../../db/schema.js";
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
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existingUser) {
    throw new Error("A user with this email already exists");
  }

  // Check for existing non-expired pending invitation
  const [existingInvite] = await db
    .select({ id: userInvitations.id })
    .from(userInvitations)
    .where(
      and(
        eq(userInvitations.email, email),
        isNull(userInvitations.usedAt),
        isNull(userInvitations.revokedAt),
        gt(userInvitations.expiresAt, now)
      )
    );
  if (existingInvite) {
    throw new Error("An active invitation already exists for this email");
  }

  const token = randomBytes(INVITE_TOKEN_BYTES).toString("hex");
  const tokenHash = hashValue(token);
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

  const id = `inv_${crypto.randomUUID()}`;

  const [invitation] = await db
    .insert(userInvitations)
    .values({
      id,
      email,
      tokenHash,
      role,
      groupIds,
      invitedByUserId: input.invitedByUserId,
      expiresAt,
      createdAt: now,
    })
    .returning();

  if (!invitation) throw new Error("Failed to create invitation");

  return { invitation, token };
}

export async function listInvitations() {
  const invitations = await db
    .select({
      invitation: userInvitations,
      inviterEmail: users.email,
    })
    .from(userInvitations)
    .leftJoin(users, eq(userInvitations.invitedByUserId, users.id))
    .orderBy(userInvitations.createdAt);

  return invitations.map((row) => ({
    ...row.invitation,
    invitedByEmail: row.inviterEmail,
  }));
}

export async function revokeInvitation(invitationId: string) {
  const [updated] = await db
    .update(userInvitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userInvitations.id, invitationId),
        isNull(userInvitations.usedAt),
        isNull(userInvitations.revokedAt)
      )
    )
    .returning();

  return updated ?? null;
}

export async function validateInviteToken(token: string) {
  const tokenHash = hashValue(token);
  const [row] = await db
    .select()
    .from(userInvitations)
    .where(
      and(
        eq(userInvitations.tokenHash, tokenHash),
        isNull(userInvitations.usedAt),
        isNull(userInvitations.revokedAt)
      )
    );

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

  const user = await db.transaction(async (tx) => {
    // Re-validate inside transaction to prevent TOCTOU race
    const [invitation] = await tx
      .select()
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.tokenHash, tokenHash),
          isNull(userInvitations.usedAt),
          isNull(userInvitations.revokedAt)
        )
      );

    if (!invitation || invitation.expiresAt < now) {
      throw new Error("Invalid or expired invitation");
    }

    // Mark invitation as used first (prevents concurrent accepts)
    const [marked] = await tx
      .update(userInvitations)
      .set({ usedAt: now })
      .where(and(eq(userInvitations.id, invitation.id), isNull(userInvitations.usedAt)))
      .returning();

    if (!marked) {
      throw new Error("Invalid or expired invitation");
    }

    // Create user
    const [created] = await tx
      .insert(users)
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
      .returning();

    if (!created) throw new Error("Failed to create user");

    // Create password identity
    await tx.insert(authIdentities).values({
      id: `auth_${crypto.randomUUID()}`,
      userId: created.id,
      provider: "password",
      providerUserId: created.email,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    // Add group memberships
    if (invitation.groupIds.length > 0) {
      await tx.insert(userGroupMemberships).values(
        invitation.groupIds.map((groupId) => ({
          id: `ugm_${crypto.randomUUID()}`,
          userId: created.id,
          groupId,
          addedBy: invitation.invitedByUserId,
          createdAt: now,
        }))
      );
    }

    return created;
  });

  return toSessionUser(user);
}
