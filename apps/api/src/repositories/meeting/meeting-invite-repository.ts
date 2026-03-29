import { sql } from "kysely";
import { db } from "../../db/index.js";

// ---------------------------------------------------------------------------
// Invite queries
// ---------------------------------------------------------------------------

export async function findValidInviteByToken(token: string) {
  return (
    (await db
      .selectFrom("meeting_invites")
      .selectAll()
      .where("token", "=", token)
      .where("revokedAt", "is", null)
      .where("expiresAt", ">", new Date())
      .executeTakeFirst()) ?? null
  );
}

export async function findInviteByToken(token: string) {
  return (
    (await db
      .selectFrom("meeting_invites")
      .select("id")
      .where("token", "=", token)
      .executeTakeFirst()) ?? null
  );
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
  return (
    (await db
      .insertInto("meeting_invites")
      .values({
        id: input.id,
        meetingId: input.meetingId,
        token: input.token,
        createdByUserId: input.createdByUserId,
        label: input.label,
        maxUses: input.maxUses,
        useCount: input.useCount,
        expiresAt: input.expiresAt,
        createdAt: input.createdAt,
      })
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function listInvitesByMeeting(meetingId: string) {
  return db
    .selectFrom("meeting_invites")
    .selectAll()
    .where("meetingId", "=", meetingId)
    .orderBy("createdAt", "desc")
    .execute();
}

export async function revokeInvite(inviteId: string, meetingId: string) {
  return (
    (await db
      .updateTable("meeting_invites")
      .set({ revokedAt: new Date() })
      .where("id", "=", inviteId)
      .where("meetingId", "=", meetingId)
      .where("revokedAt", "is", null)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
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
  return db.transaction().execute(async (trx) => {
    const invite = await trx
      .updateTable("meeting_invites")
      .set({ useCount: sql`use_count + 1` })
      .where("token", "=", token)
      .where("revokedAt", "is", null)
      .where("expiresAt", ">", new Date())
      .where(sql`(max_uses IS NULL OR use_count < max_uses)`, "=", sql`true`)
      .returningAll()
      .executeTakeFirst();

    if (!invite) return null;

    const created = await trx
      .insertInto("meeting_guest_requests")
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
      .returningAll()
      .executeTakeFirst();

    return { invite, guestRequest: created };
  });
}

export async function getGuestRequestByIdAndInvite(requestId: string, inviteId: string) {
  return (
    (await db
      .selectFrom("meeting_guest_requests")
      .selectAll()
      .where("id", "=", requestId)
      .where("inviteId", "=", inviteId)
      .executeTakeFirst()) ?? null
  );
}

export async function listGuestRequestsByMeeting(meetingId: string) {
  return db
    .selectFrom("meeting_guest_requests")
    .selectAll()
    .where("meetingId", "=", meetingId)
    .orderBy("createdAt", "desc")
    .execute();
}

export async function resolveGuestRequest(
  requestId: string,
  meetingId: string,
  status: "approved" | "rejected",
  userId: string
) {
  return (
    (await db
      .updateTable("meeting_guest_requests")
      .set({
        status,
        approvedByUserId: userId,
        resolvedAt: new Date(),
      })
      .where("id", "=", requestId)
      .where("meetingId", "=", meetingId)
      .where("status", "=", "pending")
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}
