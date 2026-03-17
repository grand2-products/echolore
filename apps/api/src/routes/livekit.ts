import { UserRole } from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { z } from "zod";
import { jsonError, withErrorHandler } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import { requireRole } from "../lib/auth.js";
import { livekitApiKey, livekitApiSecret, livekitHost } from "../lib/livekit-config.js";
import { isOwnerOrAdmin } from "../lib/route-helpers.js";
import { getMeetingById } from "../repositories/meeting/meeting-repository.js";
import * as coworkingMcu from "../services/coworking/coworking-mcu-service.js";
import * as recordingService from "../services/meeting/recording-service.js";

export const livekitRoutes = new Hono<AppEnv>();

const livekitTokenSchema = z.object({
  roomName: z.string().min(1).max(200),
  participantName: z.string().min(1).max(200),
  participantIdentity: z.string().min(1).max(200),
});

const startRecordingBody = z.object({
  meetingId: z.string().min(1),
});

const stopRecordingBody = z.object({
  egressId: z.string().min(1),
  meetingId: z.string().min(1),
});

if (!livekitApiKey || !livekitApiSecret) {
  console.warn(
    "[livekit] LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set — LiveKit routes will fail at runtime"
  );
}

const roomService = new RoomServiceClient(livekitHost, livekitApiKey, livekitApiSecret);

// POST /api/livekit/token - Generate access token for a room
livekitRoutes.post(
  "/token",
  zValidator("json", livekitTokenSchema),
  withErrorHandler("LIVEKIT_TOKEN_GENERATE_FAILED", "Failed to generate token"),
  async (c) => {
    const { roomName, participantName, participantIdentity } = c.req.valid("json");
    const user = c.get("user");

    if (participantIdentity !== user.id) {
      return jsonError(
        c,
        403,
        "IDENTITY_MISMATCH",
        "participantIdentity must match authenticated user"
      );
    }

    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: participantIdentity,
      name: participantName,
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return c.json({ token });
  }
);

// GET /api/livekit/rooms - List all rooms
livekitRoutes.get(
  "/rooms",
  requireRole(UserRole.Admin),
  withErrorHandler("LIVEKIT_ROOMS_LIST_FAILED", "Failed to list rooms"),
  async (c) => {
    const rooms = await roomService.listRooms();
    return c.json({ rooms });
  }
);

// POST /api/livekit/rooms - Create a new room
const createRoomSchema = z.object({
  name: z.string().min(1).max(128),
  emptyTimeout: z.number().int().min(60).max(3600).default(300),
  maxParticipants: z.number().int().min(1).max(500).default(100),
});

livekitRoutes.post(
  "/rooms",
  requireRole(UserRole.Admin),
  zValidator("json", createRoomSchema),
  withErrorHandler("LIVEKIT_ROOM_CREATE_FAILED", "Failed to create room"),
  async (c) => {
    const { name, emptyTimeout, maxParticipants } = c.req.valid("json");

    const room = await roomService.createRoom({
      name,
      emptyTimeout,
      maxParticipants,
    });

    return c.json({ room }, 201);
  }
);

// DELETE /api/livekit/rooms/:name - Delete a room
livekitRoutes.delete(
  "/rooms/:name",
  requireRole(UserRole.Admin),
  withErrorHandler("LIVEKIT_ROOM_DELETE_FAILED", "Failed to delete room"),
  async (c) => {
    const { name } = c.req.param();

    await roomService.deleteRoom(name);
    return c.json({ success: true });
  }
);

// GET /api/livekit/rooms/:name/participants - List participants in a room
livekitRoutes.get(
  "/rooms/:name/participants",
  requireRole(UserRole.Admin),
  withErrorHandler("LIVEKIT_PARTICIPANTS_LIST_FAILED", "Failed to list participants"),
  async (c) => {
    const { name } = c.req.param();

    const participants = await roomService.listParticipants(name);
    return c.json({ participants });
  }
);

// POST /api/livekit/rooms/:name/start-recording - Start recording
livekitRoutes.post(
  "/rooms/:name/start-recording",
  zValidator("json", startRecordingBody),
  withErrorHandler("LIVEKIT_RECORDING_START_FAILED", "Failed to start recording"),
  async (c) => {
    const { name } = c.req.param();
    const user = c.get("user");
    const { meetingId } = c.req.valid("json");

    const meeting = await getMeetingById(meetingId);
    if (!meeting || !isOwnerOrAdmin(user, meeting.creatorId)) {
      return jsonError(c, 403, "RECORDING_FORBIDDEN", "Forbidden");
    }

    const { egressInfo, recording } = await recordingService.startRecording(
      name,
      meetingId,
      user?.id ?? "unknown"
    );
    return c.json({ egressId: egressInfo.egressId, recording });
  }
);

// POST /api/livekit/rooms/:name/stop-recording - Stop recording
livekitRoutes.post(
  "/rooms/:name/stop-recording",
  zValidator("json", stopRecordingBody),
  withErrorHandler("LIVEKIT_RECORDING_STOP_FAILED", "Failed to stop recording"),
  async (c) => {
    const user = c.get("user");
    const { egressId, meetingId } = c.req.valid("json");

    const meeting = await getMeetingById(meetingId);
    if (!meeting || !isOwnerOrAdmin(user, meeting.creatorId)) {
      return jsonError(c, 403, "RECORDING_FORBIDDEN", "Forbidden");
    }

    await recordingService.stopRecording(egressId);
    return c.json({ success: true });
  }
);

// GET /api/livekit/rooms/:name/recording-status - Get recording status
livekitRoutes.get(
  "/rooms/:name/recording-status",
  withErrorHandler("LIVEKIT_RECORDING_STATUS_FAILED", "Failed to get recording status"),
  async (c) => {
    const user = c.get("user");
    const meetingId = c.req.query("meetingId");
    if (!meetingId) {
      return jsonError(c, 400, "MEETING_ID_REQUIRED", "meetingId query param is required");
    }

    const meeting = await getMeetingById(meetingId);
    if (!meeting || !isOwnerOrAdmin(user, meeting.creatorId)) {
      return jsonError(c, 403, "RECORDING_FORBIDDEN", "Forbidden");
    }

    const recordings = await recordingService.getRecordingStatus(meetingId);
    return c.json({ recordings });
  }
);

// POST /api/livekit/coworking/start-composite - Start MCU composite
livekitRoutes.post(
  "/coworking/start-composite",
  requireRole(UserRole.Admin),
  withErrorHandler("COWORKING_COMPOSITE_START_FAILED", "Failed to start composite"),
  async (c) => {
    const status = await coworkingMcu.startCoworkingComposite();
    return c.json(status);
  }
);

// POST /api/livekit/coworking/stop-composite - Stop MCU composite (admin only)
livekitRoutes.post(
  "/coworking/stop-composite",
  requireRole(UserRole.Admin),
  withErrorHandler("COWORKING_COMPOSITE_STOP_FAILED", "Failed to stop composite"),
  async (c) => {
    await coworkingMcu.stopCoworkingComposite();
    return c.json({ success: true });
  }
);

// GET /api/livekit/coworking/composite-status - Get composite status
livekitRoutes.get(
  "/coworking/composite-status",
  withErrorHandler("COWORKING_COMPOSITE_STATUS_FAILED", "Failed to get composite status"),
  async (c) => {
    return c.json(coworkingMcu.getCoworkingCompositeStatus());
  }
);
