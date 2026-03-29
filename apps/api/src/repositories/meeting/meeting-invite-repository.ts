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
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date())
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
        meeting_id: input.meetingId,
        token: input.token,
        created_by_user_id: input.createdByUserId,
        label: input.label,
        max_uses: input.maxUses,
        use_count: input.useCount,
        expires_at: input.expiresAt,
        created_at: input.createdAt,
      })
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function listInvitesByMeeting(meetingId: string) {
  return db
    .selectFrom("meeting_invites")
    .selectAll()
    .where("meeting_id", "=", meetingId)
    .orderBy("created_at", "desc")
    .execute();
}

export async function revokeInvite(inviteId: string, meetingId: string) {
  return (
    (await db
      .updateTable("meeting_invites")
      .set({ revoked_at: new Date() })
      .where("id", "=", inviteId)
      .where("meeting_id", "=", meetingId)
      .where("revoked_at", "is", null)
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
      .set({ use_count: sql`use_count + 1` })
      .where("token", "=", token)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date())
      .where(sql`(max_uses IS NULL OR use_count < max_uses)`, "=", sql`true`)
      .returningAll()
      .executeTakeFirst();

    if (!invite) return null;

    const created = await trx
      .insertInto("meeting_guest_requests")
      .values({
        id: guestRequest.id,
        invite_id: invite.id,
        meeting_id: invite.meeting_id,
        guest_name: guestRequest.guestName,
        guest_identity: guestRequest.guestIdentity,
        status: "pending",
        ip_address: guestRequest.ipAddress,
        user_agent: guestRequest.userAgent,
        created_at: new Date(),
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
      .where("invite_id", "=", inviteId)
      .executeTakeFirst()) ?? null
  );
}

export async function listGuestRequestsByMeeting(meetingId: string) {
  return db
    .selectFrom("meeting_guest_requests")
    .selectAll()
    .where("meeting_id", "=", meetingId)
    .orderBy("created_at", "desc")
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
        approved_by_user_id: userId,
        resolved_at: new Date(),
      })
      .where("id", "=", requestId)
      .where("meeting_id", "=", meetingId)
      .where("status", "=", "pending")
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}
