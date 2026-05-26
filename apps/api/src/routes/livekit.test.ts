import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMeetingByRoomNameMock, authorizeOwnerResourceMock } = vi.hoisted(() => ({
  getMeetingByRoomNameMock: vi.fn(),
  authorizeOwnerResourceMock: vi.fn(),
}));

vi.mock("../lib/livekit-config.js", () => ({
  livekitApiKey: "test-key",
  livekitApiSecret: "test-secret",
}));

vi.mock("../lib/auth.js", () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("../lib/livekit-client.js", () => ({
  roomService: {
    listRooms: vi.fn(),
    createRoom: vi.fn(),
    deleteRoom: vi.fn(),
    listParticipants: vi.fn(),
  },
}));

vi.mock("../services/coworking/coworking-mcu-service.js", () => ({
  COWORKING_ROOM: "everybody-coworking",
  startCoworkingComposite: vi.fn(),
  stopCoworkingComposite: vi.fn(),
  getCoworkingCompositeStatus: vi.fn(),
}));

vi.mock("../services/meeting/meeting-service.js", () => ({
  getMeetingById: vi.fn(),
  getMeetingByRoomName: getMeetingByRoomNameMock,
}));

vi.mock("../services/meeting/recording-service.js", () => ({
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  getRecordingStatus: vi.fn(),
}));

vi.mock("../policies/authorization-policy.js", () => ({
  authorizeOwnerResource: authorizeOwnerResourceMock,
}));

vi.mock("./coworking-hls.js", () => ({
  generateHlsToken: () => ({ token: "hls-token", expires: 0 }),
}));

vi.mock("livekit-server-sdk", () => ({
  AccessToken: class {
    constructor(_key: string, _secret: string, _opts: unknown) {}
    addGrant() {}
    toJwt() {
      return Promise.resolve("issued-jwt");
    }
  },
}));

const { livekitRoutes } = await import("./livekit.js");

type TestUser = { id: string; role: "member" | "admin"; name: string };

const DEFAULT_USER: TestUser = { id: "user-1", role: "member", name: "Taro" };

function makeApp(user: TestUser = DEFAULT_USER) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: hono Variables map is typed per AppEnv; tests inject a minimal user
    (c.set as any)("user", user);
    await next();
  });
  app.route("/", livekitRoutes);
  return app;
}

async function postToken(body: Record<string, string>, user?: TestUser) {
  return makeApp(user).request("/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/livekit/token authorization", () => {
  beforeEach(() => {
    getMeetingByRoomNameMock.mockReset();
    authorizeOwnerResourceMock.mockReset();
  });

  it("rejects identity mismatch with 403", async () => {
    const res = await postToken({
      roomName: "everybody-coworking",
      participantName: "Taro",
      participantIdentity: "someone-else",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("IDENTITY_MISMATCH");
  });

  it("allows tokens for the coworking room without meeting lookup", async () => {
    const res = await postToken({
      roomName: "everybody-coworking",
      participantName: "Taro",
      participantIdentity: "user-1",
    });
    expect(res.status).toBe(200);
    expect(getMeetingByRoomNameMock).not.toHaveBeenCalled();
    expect(authorizeOwnerResourceMock).not.toHaveBeenCalled();
  });

  it("rejects unknown rooms with ROOM_NOT_PERMITTED (no token leak)", async () => {
    getMeetingByRoomNameMock.mockResolvedValueOnce(null);
    const res = await postToken({
      roomName: "stranger-room",
      participantName: "Taro",
      participantIdentity: "user-1",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ROOM_NOT_PERMITTED");
  });

  it("rejects rooms the viewer can't read with MEETING_FORBIDDEN", async () => {
    getMeetingByRoomNameMock.mockResolvedValueOnce({
      id: "m1",
      roomName: "room-abc",
      creatorId: "creator-1",
      status: "active",
    });
    authorizeOwnerResourceMock.mockResolvedValueOnce({ allowed: false });

    const res = await postToken({
      roomName: "room-abc",
      participantName: "Taro",
      participantIdentity: "user-1",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MEETING_FORBIDDEN");
    expect(authorizeOwnerResourceMock).toHaveBeenCalledWith(
      expect.anything(),
      "meeting",
      "m1",
      "creator-1",
      "read"
    );
  });

  it("issues a token when the viewer has read access to the meeting", async () => {
    getMeetingByRoomNameMock.mockResolvedValueOnce({
      id: "m2",
      roomName: "room-xyz",
      creatorId: "creator-2",
      status: "active",
    });
    authorizeOwnerResourceMock.mockResolvedValueOnce({ allowed: true });

    const res = await postToken({
      roomName: "room-xyz",
      participantName: "Taro",
      participantIdentity: "user-1",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe("issued-jwt");
  });
});
