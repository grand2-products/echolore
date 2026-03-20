import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { meetingGuestRequests, meetingInvites } from "../../db/schema.js";

// ---------------------------------------------------------------------------
// Invite queries
// ---------------------------------------------------------------------------

export async function findValidInviteByToken(token: string) {
  const [invite] = await db
    .select()
    .from(meetingInvites)
    .where(
      and(
        eq(meetingInvites.token, token),
        isNull(meetingInvites.revokedAt),
        gt(meetingInvites.expiresAt, new Date())
      )
    );
  return invite ?? null;
}

export async function findInviteByToken(token: string) {
  const [invite] = await db
    .select({ id: meetingInvites.id })
    .from(meetingInvites)
    .where(eq(meetingInvites.token, token));
  return invite ?? null;
}

export async function createInvite(input: {
  id: string;
  meetingId: string;
  token: string;
  createdByUserId: string;
  label: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date;
  createdAt: Date;
}) {
  const [created] = await db.insert(meetingInvites).values(input).returning();
  return created ?? null;
}

export async function listInvitesByMeeting(meetingId: string) {
  return db
    .select()
    .from(meetingInvites)
    .where(eq(meetingInvites.meetingId, meetingId))
    .orderBy(desc(meetingInvites.createdAt));
}

export async function revokeInvite(inviteId: string, meetingId: string) {
  const [revoked] = await db
    .update(meetingInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(meetingInvites.id, inviteId),
        eq(meetingInvites.meetingId, meetingId),
        isNull(meetingInvites.revokedAt)
      )
    )
    .returning();
  return revoked ?? null;
}

// ---------------------------------------------------------------------------
// Guest request queries
// ---------------------------------------------------------------------------

export async function incrementUseCountAndCreateGuestRequest(
  token: string,
  guestRequest: {
    id: string;
    guestName: string;
    guestIdentity: string;
    ipAddress: string | null;
    userAgent: string | null;
  }
) {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .update(meetingInvites)
      .set({ useCount: sql`${meetingInvites.useCount} + 1` })
      .where(
        and(
          eq(meetingInvites.token, token),
          isNull(meetingInvites.revokedAt),
          gt(meetingInvites.expiresAt, new Date()),
          sql`(${meetingInvites.maxUses} IS NULL OR ${meetingInvites.useCount} < ${meetingInvites.maxUses})`
        )
      )
      .returning();

    if (!invite) return null;

    const [created] = await tx
      .insert(meetingGuestRequests)
      .values({
        id: guestRequest.id,
        inviteId: invite.id,
        meetingId: invite.meetingId,
        guestName: guestRequest.guestName,
        guestIdentity: guestRequest.guestIdentity,
        status: "pending",
        ipAddress: guestRequest.ipAddress,
        userAgent: guestRequest.userAgent,
        createdAt: new Date(),
      })
      .returning();

    return { invite, guestRequest: created };
  });
}

export async function getGuestRequestByIdAndInvite(requestId: string, inviteId: string) {
  const [request] = await db
    .select()
    .from(meetingGuestRequests)
    .where(
      and(eq(meetingGuestRequests.id, requestId), eq(meetingGuestRequests.inviteId, inviteId))
    );
  return request ?? null;
}

export async function listGuestRequestsByMeeting(meetingId: string) {
  return db
    .select()
    .from(meetingGuestRequests)
    .where(eq(meetingGuestRequests.meetingId, meetingId))
    .orderBy(desc(meetingGuestRequests.createdAt));
}

export async function resolveGuestRequest(
  requestId: string,
  meetingId: string,
  status: "approved" | "rejected",
  userId: string
) {
  const [updated] = await db
    .update(meetingGuestRequests)
    .set({
      status,
      approvedByUserId: userId,
      resolvedAt: new Date(),
    })
    .where(
      and(
        eq(meetingGuestRequests.id, requestId),
        eq(meetingGuestRequests.meetingId, meetingId),
        eq(meetingGuestRequests.status, "pending")
      )
    )
    .returning();
  return updated ?? null;
}

// Re-export from meeting-repository (this is a meetings-table query, not invite-specific)
export { getMeetingRoomName } from "./meeting-repository.js";
