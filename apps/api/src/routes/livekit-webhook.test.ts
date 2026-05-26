import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  receiveMock,
  endMeetingByRoomNameMock,
  handleEgressWebhookMock,
  stopCoworkingCompositeMock,
} = vi.hoisted(() => ({
  receiveMock: vi.fn(),
  endMeetingByRoomNameMock: vi.fn(),
  handleEgressWebhookMock: vi.fn(),
  stopCoworkingCompositeMock: vi.fn(),
}));

vi.mock("livekit-server-sdk", () => ({
  WebhookReceiver: class {
    receive = receiveMock;
  },
}));

vi.mock("../lib/livekit-config.js", () => ({
  livekitApiKey: "test-key",
  livekitApiSecret: "test-secret",
}));

vi.mock("../services/coworking/coworking-mcu-service.js", () => ({
  COWORKING_ROOM: "coworking",
  handleCoworkingEgressEnded: vi.fn(),
  stopCoworkingComposite: stopCoworkingCompositeMock,
}));

vi.mock("../services/meeting/recording-service.js", () => ({
  handleEgressWebhook: handleEgressWebhookMock,
}));

vi.mock("../services/meeting/meeting-service.js", () => ({
  endMeetingByRoomName: endMeetingByRoomNameMock,
}));

const { livekitWebhookRoutes } = await import("./livekit-webhook.js");

function makeApp() {
  const app = new Hono();
  app.route("/", livekitWebhookRoutes);
  return app;
}

async function postWebhook() {
  return makeApp().request("/", {
    method: "POST",
    headers: { authorization: "Bearer test", "content-type": "application/json" },
    body: "{}",
  });
}

describe("livekit-webhook room_finished", () => {
  beforeEach(() => {
    receiveMock.mockReset();
    endMeetingByRoomNameMock.mockReset();
    handleEgressWebhookMock.mockReset();
    stopCoworkingCompositeMock.mockReset();
  });

  it("ends the meeting when a meeting room finishes", async () => {
    receiveMock.mockResolvedValue({ event: "room_finished", room: { name: "room-abc" } });
    endMeetingByRoomNameMock.mockResolvedValue({ id: "meeting-1", roomName: "room-abc" });

    const res = await postWebhook();

    expect(res.status).toBe(200);
    expect(endMeetingByRoomNameMock).toHaveBeenCalledTimes(1);
    expect(endMeetingByRoomNameMock).toHaveBeenCalledWith("room-abc", expect.any(Date));
  });

  it("skips the coworking room on room_finished", async () => {
    receiveMock.mockResolvedValue({ event: "room_finished", room: { name: "coworking" } });

    const res = await postWebhook();

    expect(res.status).toBe(200);
    expect(endMeetingByRoomNameMock).not.toHaveBeenCalled();
  });

  it("is a no-op response when room_finished maps to no meeting", async () => {
    receiveMock.mockResolvedValue({ event: "room_finished", room: { name: "room-gone" } });
    endMeetingByRoomNameMock.mockResolvedValue(null);

    const res = await postWebhook();

    expect(res.status).toBe(200);
    expect(endMeetingByRoomNameMock).toHaveBeenCalledWith("room-gone", expect.any(Date));
  });

  it("does not end meetings for unrelated events", async () => {
    receiveMock.mockResolvedValue({ event: "participant_joined", room: { name: "room-abc" } });

    const res = await postWebhook();

    expect(res.status).toBe(200);
    expect(endMeetingByRoomNameMock).not.toHaveBeenCalled();
  });

  it("returns 401 when signature verification fails", async () => {
    receiveMock.mockRejectedValue(new Error("bad signature"));

    const res = await postWebhook();

    expect(res.status).toBe(401);
    expect(endMeetingByRoomNameMock).not.toHaveBeenCalled();
  });
});
