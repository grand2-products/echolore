import { beforeEach, describe, expect, it, vi } from "vitest";

const { getValkeyMock } = vi.hoisted(() => ({
  getValkeyMock: vi.fn(),
}));

vi.mock("../../lib/valkey.js", () => ({
  getValkey: getValkeyMock,
}));

describe("meeting-events (H1)", () => {
  beforeEach(() => {
    vi.resetModules();
    getValkeyMock.mockReset();
  });

  describe("in-process fallback when Valkey is unavailable", () => {
    it("delivers events via the local EventEmitter and never calls Valkey", async () => {
      getValkeyMock.mockReturnValue(null);
      const { emitTranscriptFinalized, onTranscriptFinalized } = await import(
        "./meeting-events.js"
      );

      const events: string[] = [];
      const off = onTranscriptFinalized((e) => events.push(e.meetingId));

      emitTranscriptFinalized("m1");
      emitTranscriptFinalized("m2");
      off();
      emitTranscriptFinalized("m3");

      expect(events).toEqual(["m1", "m2"]);
      expect(getValkeyMock).toHaveBeenCalled();
    });
  });

  describe("Valkey-backed fanout (H1)", () => {
    it("publishes to the Valkey channel on emit", async () => {
      const publish = vi.fn().mockResolvedValue(1);
      const subscriber = {
        on: vi.fn(),
        subscribe: vi.fn().mockResolvedValue(undefined),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
      };
      const valkey = {
        publish,
        duplicate: vi.fn().mockReturnValue(subscriber),
      };
      getValkeyMock.mockReturnValue(valkey);

      const { emitTranscriptFinalized, shutdownMeetingEventBus } = await import(
        "./meeting-events.js"
      );

      emitTranscriptFinalized("meeting-xyz");

      // publish is invoked synchronously (sync code path), but its return is a
      // promise; we just need to assert the channel + payload.
      expect(publish).toHaveBeenCalledTimes(1);
      const [channel, payload] = publish.mock.calls[0] ?? [];
      expect(channel).toBe("echolore:meeting-events:transcript-finalized");
      const parsed = JSON.parse(payload as string) as { meetingId: string; origin?: string };
      expect(parsed.meetingId).toBe("meeting-xyz");
      expect(typeof parsed.origin).toBe("string");

      // Confirm the subscriber was wired up exactly once.
      expect(valkey.duplicate).toHaveBeenCalledTimes(1);
      expect(subscriber.subscribe).toHaveBeenCalledWith(
        "echolore:meeting-events:transcript-finalized"
      );

      await shutdownMeetingEventBus();
    });

    it("rebroadcasts messages received on the Valkey channel to local listeners", async () => {
      type MessageHandler = (channel: string, message: string) => void;
      const handlerHolder: { ref: MessageHandler | null } = { ref: null };
      const subscriber = {
        on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
          if (event === "message") {
            handlerHolder.ref = fn as MessageHandler;
          }
        }),
        subscribe: vi.fn().mockResolvedValue(undefined),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
      };
      const valkey = {
        publish: vi.fn().mockResolvedValue(1),
        duplicate: vi.fn().mockReturnValue(subscriber),
      };
      getValkeyMock.mockReturnValue(valkey);

      const { onTranscriptFinalized, shutdownMeetingEventBus } = await import(
        "./meeting-events.js"
      );

      const received: string[] = [];
      const off = onTranscriptFinalized((e) => received.push(e.meetingId));

      // Wiring is async (subscriber.subscribe is awaited internally), but the
      // `on('message')` handler is registered synchronously inside
      // startValkeySubscriberIfNeeded.
      expect(handlerHolder.ref).not.toBeNull();
      handlerHolder.ref?.(
        "echolore:meeting-events:transcript-finalized",
        JSON.stringify({ meetingId: "remote-meeting", origin: "other-pod" })
      );

      expect(received).toEqual(["remote-meeting"]);
      off();
      await shutdownMeetingEventBus();
    });

    it("ignores malformed pub/sub payloads without crashing", async () => {
      type MessageHandler = (channel: string, message: string) => void;
      const handlerHolder: { ref: MessageHandler | null } = { ref: null };
      const subscriber = {
        on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
          if (event === "message") {
            handlerHolder.ref = fn as MessageHandler;
          }
        }),
        subscribe: vi.fn().mockResolvedValue(undefined),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
      };
      getValkeyMock.mockReturnValue({
        publish: vi.fn().mockResolvedValue(1),
        duplicate: vi.fn().mockReturnValue(subscriber),
      });

      const { onTranscriptFinalized, shutdownMeetingEventBus } = await import(
        "./meeting-events.js"
      );

      const received: string[] = [];
      const off = onTranscriptFinalized((e) => received.push(e.meetingId));

      handlerHolder.ref?.("echolore:meeting-events:transcript-finalized", "{not json");
      handlerHolder.ref?.("echolore:meeting-events:transcript-finalized", JSON.stringify({}));
      handlerHolder.ref?.(
        "echolore:meeting-events:transcript-finalized",
        JSON.stringify({
          meetingId: 42,
        })
      );

      expect(received).toEqual([]);
      off();
      await shutdownMeetingEventBus();
    });
  });
});
