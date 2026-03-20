import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { AccessToken, DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk";
import { z } from "zod";
import { jsonError, withErrorHandler } from "../lib/api-error.js";
import { livekitApiKey, livekitApiSecret, livekitHost } from "../lib/livekit-config.js";
import { getRequestIp } from "../lib/password-auth-guard.js";
import { getValkey } from "../lib/valkey.js";
import {
  findInviteByToken,
  findValidInviteByToken,
  getGuestRequestByIdAndInvite,
  getMeetingRoomName,
  incrementUseCountAndCreateGuestRequest,
} from "../services/meeting/meeting-invite-service.js";
import { getMeetingById } from "../services/meeting/meeting-service.js";

const roomService = new RoomServiceClient(livekitHost, livekitApiKey, livekitApiSecret);
const encoder = new TextEncoder();

export const meetingGuestRoutes = new Hono();

// Rate limit via Valkey (Redis-compatible) — 10 requests per 60s window per IP
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

async function checkRateLimit(ip: string): Promise<boolean> {
  const valkey = getValkey();
  if (!valkey) return true; // allow if Valkey unavailable

  const key = `rate:guest-request:${ip}`;
  try {
    const count = await valkey.incr(key);
    if (count === 1) await valkey.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    return count <= RATE_LIMIT_MAX;
  } catch {
    return true; // allow if Valkey errors
  }
}

const joinRequestSchema = z.object({
  guestName: z.string().min(1).max(100),
});

// GET /api/meetings/join/:token — Validate invite token
meetingGuestRoutes.get(
  "/join/:token",
  withErrorHandler("INVITE_VALIDATE_FAILED", "Failed to validate invite"),
  async (c) => {
    const { token } = c.req.param();

    const invite = await findValidInviteByToken(token);

    if (!invite) {
      return jsonError(c, 404, "INVITE_NOT_FOUND", "Invite not found or expired");
    }

    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
      return jsonError(c, 410, "INVITE_EXHAUSTED", "Invite has reached its usage limit");
    }

    const meeting = await getMeetingById(invite.meetingId);

    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    return c.json({
      meeting: { id: meeting.id, title: meeting.title, status: meeting.status },
      invite: {
        id: invite.id,
        label: invite.label,
        expiresAt: invite.expiresAt.toISOString(),
      },
    });
  }
);

// POST /api/meetings/join/:token/request — Submit join request
meetingGuestRoutes.post(
  "/join/:token/request",
  zValidator("json", joinRequestSchema),
  withErrorHandler("GUEST_REQUEST_FAILED", "Failed to submit join request"),
  async (c) => {
    const ip = getRequestIp(c.req.raw.headers) ?? "unknown";
    if (!(await checkRateLimit(ip))) {
      return jsonError(c, 429, "RATE_LIMITED", "Too many requests");
    }

    const { token } = c.req.param();
    const { guestName } = c.req.valid("json");

    const requestId = crypto.randomUUID();
    const shortId = requestId.slice(0, 8);
    // Use only the short ID for identity to avoid special characters in guestName
    const guestIdentity = `guest-${shortId}`;

    // Atomic: increment useCount + create guest request in a single transaction
    const result = await incrementUseCountAndCreateGuestRequest(token, {
      id: requestId,
      guestName,
      guestIdentity,
      ipAddress: ip,
      userAgent: c.req.header("user-agent") ?? null,
    });

    if (!result || !result.guestRequest) {
      if (!result) {
        return jsonError(c, 404, "INVITE_NOT_FOUND", "Invite not found, expired, or full");
      }
      return jsonError(c, 500, "GUEST_REQUEST_FAILED", "Failed to create guest request");
    }

    const { invite, guestRequest } = result;

    // Notify room participants via LiveKit DataChannel
    try {
      const roomName = await getMeetingRoomName(invite.meetingId);

      if (roomName) {
        const msg = {
          type: "guest-request-new",
          requestId,
          guestName,
        };
        await roomService.sendData(
          roomName,
          encoder.encode(JSON.stringify(msg)),
          DataPacket_Kind.RELIABLE,
          { topic: "guest-request" }
        );
      }
    } catch {
      // Best-effort notification — don't fail the request
    }

    return c.json({ requestId: guestRequest.id, guestIdentity: guestRequest.guestIdentity }, 201);
  }
);

// GET /api/meetings/join/:token/request/:requestId/status — Poll approval status
meetingGuestRoutes.get(
  "/join/:token/request/:requestId/status",
  withErrorHandler("GUEST_STATUS_FAILED", "Failed to check guest request status"),
  async (c) => {
    const { token, requestId } = c.req.param();

    // Verify invite token matches the request's invite
    const invite = await findInviteByToken(token);

    if (!invite) {
      return jsonError(c, 404, "INVITE_NOT_FOUND", "Invite not found");
    }

    const request = await getGuestRequestByIdAndInvite(requestId, invite.id);

    if (!request) {
      return jsonError(c, 404, "REQUEST_NOT_FOUND", "Guest request not found");
    }

    if (request.status === "pending") {
      return c.json({ status: "pending" as const });
    }

    if (request.status === "rejected") {
      return c.json({ status: "rejected" as const });
    }

    // approved — return cached LiveKit token or generate a new one
    const cacheKey = `guest-token:${requestId}`;
    const valkey = getValkey();

    // Try cache first
    if (valkey) {
      try {
        const cached = await valkey.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as { token: string; roomName: string };
          return c.json({
            status: "approved" as const,
            token: parsed.token,
            roomName: parsed.roomName,
          });
        }
      } catch {
        // cache miss or error — fall through to generate
      }
    }

    const meeting = await getMeetingById(request.meetingId);

    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: request.guestIdentity,
      name: request.guestName,
    });

    at.addGrant({
      roomJoin: true,
      room: meeting.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const livekitToken = await at.toJwt();

    // Cache for 5 minutes (token is valid longer, but guest should connect quickly)
    if (valkey) {
      try {
        await valkey.set(
          cacheKey,
          JSON.stringify({ token: livekitToken, roomName: meeting.roomName }),
          "EX",
          300
        );
      } catch {
        // cache write failure is non-critical
      }
    }

    return c.json({
      status: "approved" as const,
      token: livekitToken,
      roomName: meeting.roomName,
    });
  }
);
