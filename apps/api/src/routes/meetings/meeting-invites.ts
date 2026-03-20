import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk";
import { z } from "zod";
import type { meetingGuestRequests, meetingInvites } from "../../db/schema.js";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { livekitApiKey, livekitApiSecret, livekitHost } from "../../lib/livekit-config.js";
import { authorizeOwnerResource } from "../../policies/authorization-policy.js";
import {
  createInvite,
  listGuestRequestsByMeeting,
  listInvitesByMeeting,
  resolveGuestRequest,
  revokeInvite,
} from "../../services/meeting/meeting-invite-service.js";
import { getMeetingById } from "../../services/meeting/meeting-service.js";

const roomService = new RoomServiceClient(livekitHost, livekitApiKey, livekitApiSecret);
const encoder = new TextEncoder();

export const meetingInviteRoutes = new Hono<AppEnv>();

type Meeting = NonNullable<Awaited<ReturnType<typeof getMeetingById>>>;

async function requireMeetingAccess(
  c: Context<AppEnv>,
  id: string,
  action: "read" | "write"
): Promise<Meeting | Response> {
  const meeting = await getMeetingById(id);
  if (!meeting) {
    return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
  }
  const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, action);
  if (!authz.allowed) {
    return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
  }
  return meeting;
}

const createInviteSchema = z.object({
  label: z.string().max(200).optional(),
  maxUses: z.number().int().min(1).max(1000).optional(),
  expiresInSeconds: z.number().int().min(300).max(604800), // 5min to 7days
});

// POST /api/meetings/:id/invites — Create invite link
meetingInviteRoutes.post(
  "/:id/invites",
  zValidator("json", createInviteSchema),
  withErrorHandler("INVITE_CREATE_FAILED", "Failed to create invite"),
  async (c) => {
    const { id } = c.req.param();
    const result = await requireMeetingAccess(c, id, "write");
    if (result instanceof Response) return result;

    const user = c.get("user");
    const data = c.req.valid("json");

    const created = await createInvite({
      id: crypto.randomUUID(),
      meetingId: id,
      token: crypto.randomUUID(),
      createdByUserId: user.id,
      label: data.label ?? null,
      maxUses: data.maxUses ?? null,
      useCount: 0,
      expiresAt: new Date(Date.now() + data.expiresInSeconds * 1000),
      createdAt: new Date(),
    });

    if (!created) {
      return jsonError(c, 500, "INVITE_CREATE_FAILED", "Failed to create invite");
    }

    return c.json({ invite: toInviteDto(created) }, 201);
  }
);

// GET /api/meetings/:id/invites — List invites
meetingInviteRoutes.get(
  "/:id/invites",
  withErrorHandler("INVITE_LIST_FAILED", "Failed to list invites"),
  async (c) => {
    const { id } = c.req.param();
    const result = await requireMeetingAccess(c, id, "read");
    if (result instanceof Response) return result;

    const invites = await listInvitesByMeeting(id);

    return c.json({ invites: invites.map(toInviteDto) });
  }
);

// DELETE /api/meetings/:id/invites/:inviteId — Revoke invite
meetingInviteRoutes.delete(
  "/:id/invites/:inviteId",
  withErrorHandler("INVITE_REVOKE_FAILED", "Failed to revoke invite"),
  async (c) => {
    const { id, inviteId } = c.req.param();
    const result = await requireMeetingAccess(c, id, "write");
    if (result instanceof Response) return result;

    const revoked = await revokeInvite(inviteId, id);

    if (!revoked) {
      return jsonError(c, 404, "INVITE_NOT_FOUND", "Invite not found or already revoked");
    }

    return c.json({ success: true });
  }
);

// GET /api/meetings/:id/guest-requests — List pending guest requests
meetingInviteRoutes.get(
  "/:id/guest-requests",
  withErrorHandler("GUEST_REQUESTS_LIST_FAILED", "Failed to list guest requests"),
  async (c) => {
    const { id } = c.req.param();
    const result = await requireMeetingAccess(c, id, "read");
    if (result instanceof Response) return result;

    const requests = await listGuestRequestsByMeeting(id);

    return c.json({ requests: requests.map(toGuestRequestDto) });
  }
);

// POST /api/meetings/:id/guest-requests/:requestId/approve — Approve guest
meetingInviteRoutes.post(
  "/:id/guest-requests/:requestId/approve",
  withErrorHandler("GUEST_APPROVE_FAILED", "Failed to approve guest request"),
  async (c) => {
    const { id, requestId } = c.req.param();
    const result = await requireMeetingAccess(c, id, "write");
    if (result instanceof Response) return result;
    const meeting = result;

    const user = c.get("user");

    const updated = await resolveGuestRequest(requestId, id, "approved", user.id);

    if (!updated) {
      return jsonError(c, 404, "REQUEST_NOT_FOUND", "Request not found or already resolved");
    }

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
  }
);

// POST /api/meetings/:id/guest-requests/:requestId/reject — Reject guest
meetingInviteRoutes.post(
  "/:id/guest-requests/:requestId/reject",
  withErrorHandler("GUEST_REJECT_FAILED", "Failed to reject guest request"),
  async (c) => {
    const { id, requestId } = c.req.param();
    const result = await requireMeetingAccess(c, id, "write");
    if (result instanceof Response) return result;
    const meeting = result;

    const user = c.get("user");

    const updated = await resolveGuestRequest(requestId, id, "rejected", user.id);

    if (!updated) {
      return jsonError(c, 404, "REQUEST_NOT_FOUND", "Request not found or already resolved");
    }

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
  }
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
