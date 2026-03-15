import { UserRole } from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk";
import { z } from "zod";
import { db } from "../../db/index.js";
import { meetingGuestRequests, meetingInvites, meetings } from "../../db/schema.js";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { livekitApiKey, livekitApiSecret, livekitHost } from "../../lib/livekit-config.js";
import { authorizeOwnerResource } from "../../policies/authorization-policy.js";

const roomService = new RoomServiceClient(livekitHost, livekitApiKey, livekitApiSecret);
const encoder = new TextEncoder();

export const meetingInviteRoutes = new Hono<AppEnv>();

const createInviteSchema = z.object({
  label: z.string().max(200).optional(),
  maxUses: z.number().int().min(1).max(1000).optional(),
  expiresInSeconds: z.number().int().min(300).max(604800), // 5min to 7days
});

// POST /api/meetings/:id/invites — Create invite link
meetingInviteRoutes.post(
  "/:id/invites",
  zValidator("json", createInviteSchema),
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const user = c.get("user");
      const data = c.req.valid("json");

      const meeting = await db.query.meetings.findFirst({
        where: eq(meetings.id, id),
      });
      if (!meeting) {
        return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
      }

      const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
      if (!authz.allowed) {
        return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
      }

      const invite = {
        id: crypto.randomUUID(),
        meetingId: id,
        token: crypto.randomUUID(),
        createdByUserId: user.id,
        label: data.label ?? null,
        maxUses: data.maxUses ?? null,
        useCount: 0,
        expiresAt: new Date(Date.now() + data.expiresInSeconds * 1000),
        createdAt: new Date(),
      };

      const [created] = await db.insert(meetingInvites).values(invite).returning();

      if (!created) {
        return jsonError(c, 500, "INVITE_CREATE_FAILED", "Failed to create invite");
      }

      return c.json({ invite: toInviteDto(created) }, 201);
    },
    "INVITE_CREATE_FAILED",
    "Failed to create invite"
  )
);

// GET /api/meetings/:id/invites — List invites
meetingInviteRoutes.get(
  "/:id/invites",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();

      const meeting = await db.query.meetings.findFirst({
        where: eq(meetings.id, id),
      });
      if (!meeting) {
        return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
      }

      const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
      if (!authz.allowed) {
        return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
      }

      const invites = await db
        .select()
        .from(meetingInvites)
        .where(eq(meetingInvites.meetingId, id))
        .orderBy(desc(meetingInvites.createdAt));

      return c.json({ invites: invites.map(toInviteDto) });
    },
    "INVITE_LIST_FAILED",
    "Failed to list invites"
  )
);

// DELETE /api/meetings/:id/invites/:inviteId — Revoke invite
meetingInviteRoutes.delete(
  "/:id/invites/:inviteId",
  withErrorHandler(
    async (c) => {
      const { id, inviteId } = c.req.param();

      const meeting = await db.query.meetings.findFirst({
        where: eq(meetings.id, id),
      });
      if (!meeting) {
        return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
      }

      const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
      if (!authz.allowed) {
        return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
      }

      const [revoked] = await db
        .update(meetingInvites)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(meetingInvites.id, inviteId),
            eq(meetingInvites.meetingId, id),
            isNull(meetingInvites.revokedAt)
          )
        )
        .returning();

      if (!revoked) {
        return jsonError(c, 404, "INVITE_NOT_FOUND", "Invite not found or already revoked");
      }

      return c.json({ success: true });
    },
    "INVITE_REVOKE_FAILED",
    "Failed to revoke invite"
  )
);

// GET /api/meetings/:id/guest-requests — List pending guest requests
meetingInviteRoutes.get(
  "/:id/guest-requests",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();

      const meeting = await db.query.meetings.findFirst({
        where: eq(meetings.id, id),
      });
      if (!meeting) {
        return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
      }

      const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
      if (!authz.allowed) {
        return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
      }

      const requests = await db
        .select()
        .from(meetingGuestRequests)
        .where(eq(meetingGuestRequests.meetingId, id))
        .orderBy(desc(meetingGuestRequests.createdAt));

      return c.json({ requests: requests.map(toGuestRequestDto) });
    },
    "GUEST_REQUESTS_LIST_FAILED",
    "Failed to list guest requests"
  )
);

// POST /api/meetings/:id/guest-requests/:requestId/approve — Approve guest
// Note: Any authenticated user can approve (matches plan: "any room member can approve").
// The DataChannel notification only reaches in-room participants, so the UI naturally
// restricts this to room members. Server-side does not enforce room membership.
meetingInviteRoutes.post(
  "/:id/guest-requests/:requestId/approve",
  withErrorHandler(
    async (c) => {
      const { id, requestId } = c.req.param();
      const user = c.get("user");

      const meeting = await db.query.meetings.findFirst({
        where: eq(meetings.id, id),
      });
      if (!meeting) {
        return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
      }

      if (meeting.creatorId !== user.id && user.role !== UserRole.Admin) {
        return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
      }

      const [updated] = await db
        .update(meetingGuestRequests)
        .set({
          status: "approved",
          approvedByUserId: user.id,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(meetingGuestRequests.id, requestId),
            eq(meetingGuestRequests.meetingId, id),
            eq(meetingGuestRequests.status, "pending")
          )
        )
        .returning();

      if (!updated) {
        return jsonError(c, 404, "REQUEST_NOT_FOUND", "Request not found or already resolved");
      }

      // Notify room via DataChannel
      try {
        const msg = {
          type: "guest-request-resolved",
          requestId,
          status: "approved",
          resolvedBy: user.name,
        };
        await roomService.sendData(
          meeting.roomName,
          encoder.encode(JSON.stringify(msg)),
          DataPacket_Kind.RELIABLE,
          { topic: "guest-request" }
        );
      } catch {
        // Best-effort
      }

      return c.json({ success: true });
    },
    "GUEST_APPROVE_FAILED",
    "Failed to approve guest request"
  )
);

// POST /api/meetings/:id/guest-requests/:requestId/reject — Reject guest
meetingInviteRoutes.post(
  "/:id/guest-requests/:requestId/reject",
  withErrorHandler(
    async (c) => {
      const { id, requestId } = c.req.param();
      const user = c.get("user");

      const meeting = await db.query.meetings.findFirst({
        where: eq(meetings.id, id),
      });
      if (!meeting) {
        return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
      }

      if (meeting.creatorId !== user.id && user.role !== UserRole.Admin) {
        return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
      }

      const [updated] = await db
        .update(meetingGuestRequests)
        .set({
          status: "rejected",
          approvedByUserId: user.id,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(meetingGuestRequests.id, requestId),
            eq(meetingGuestRequests.meetingId, id),
            eq(meetingGuestRequests.status, "pending")
          )
        )
        .returning();

      if (!updated) {
        return jsonError(c, 404, "REQUEST_NOT_FOUND", "Request not found or already resolved");
      }

      // Notify room via DataChannel
      try {
        const msg = {
          type: "guest-request-resolved",
          requestId,
          status: "rejected",
          resolvedBy: user.name,
        };
        await roomService.sendData(
          meeting.roomName,
          encoder.encode(JSON.stringify(msg)),
          DataPacket_Kind.RELIABLE,
          { topic: "guest-request" }
        );
      } catch {
        // Best-effort
      }

      return c.json({ success: true });
    },
    "GUEST_REJECT_FAILED",
    "Failed to reject guest request"
  )
);

// DTO helpers
function toInviteDto(invite: typeof meetingInvites.$inferSelect) {
  return {
    id: invite.id,
    meetingId: invite.meetingId,
    token: invite.token,
    createdByUserId: invite.createdByUserId,
    label: invite.label,
    maxUses: invite.maxUses,
    useCount: invite.useCount,
    expiresAt: invite.expiresAt.toISOString(),
    revokedAt: invite.revokedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  };
}

function toGuestRequestDto(request: typeof meetingGuestRequests.$inferSelect) {
  return {
    id: request.id,
    inviteId: request.inviteId,
    meetingId: request.meetingId,
    guestName: request.guestName,
    guestIdentity: request.guestIdentity,
    status: request.status,
    approvedByUserId: request.approvedByUserId,
    createdAt: request.createdAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
  };
}
