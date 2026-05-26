import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitMock } = vi.hoisted(() => ({
  submitMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../internal-api-client.js", () => ({
  submitTranscriptSegment: submitMock,
}));

import { RealtimeTranscriptionManager } from "./manager.js";
import { createInMemoryRoomOwnership, type RoomOwnership } from "./room-ownership.js";
import type {
  AudioTranscriber,
  RoomAudioSource,
  RoomAudioSourceFactory,
  TranscriptResult,
} from "./types.js";

class FakeSource implements RoomAudioSource {
  audioHandler: ((chunk: import("./types.js").AudioChunk) => void) | null = null;
  leftHandler: ((id: string) => void) | null = null;
  disconnectedHandler: ((reason: string) => void) | null = null;
  connect = vi.fn(async () => {});
  disconnect = vi.fn(async () => {});

  constructor(public readonly onDisconnectedExternal?: (reason: string) => void) {}

  onAudioChunk(handler: (chunk: import("./types.js").AudioChunk) => void) {
    this.audioHandler = handler;
  }
  onParticipantLeft(handler: (id: string) => void) {
    this.leftHandler = handler;
  }
  onDisconnected(handler: (reason: string) => void) {
    this.disconnectedHandler = handler;
  }

  /** Simulate LiveKit disconnect via the factory-injected callback. */
  fireDisconnect(reason: string) {
    this.onDisconnectedExternal?.(reason);
  }
}

class FakeTranscriber implements AudioTranscriber {
  pushAudio = vi.fn();
  close = vi.fn(async () => {});
  onResult(_handler: (result: TranscriptResult) => void) {}
}

function buildManager(options: {
  ownership?: RoomOwnership;
  resolveMeetingId?: (roomName: string) => Promise<string | null>;
  sources?: FakeSource[];
}) {
  const sources: FakeSource[] = options.sources ?? [];
  const factory: RoomAudioSourceFactory = ({ onDisconnected }) => {
    const src = new FakeSource(onDisconnected);
    sources.push(src);
    return src;
  };
  const manager = new RealtimeTranscriptionManager({
    apiBaseUrl: "http://api",
    workerSecret: "secret",
    languageCode: "ja-JP",
    ownership: options.ownership,
    resolveMeetingId: options.resolveMeetingId ?? (async () => "meeting-1"),
    createSource: factory,
    createTranscriber: () => new FakeTranscriber(),
    ownershipRefreshIntervalMs: 60_000,
  });
  return { manager, sources };
}

describe("RealtimeTranscriptionManager", () => {
  beforeEach(() => {
    submitMock.mockClear();
  });

  it("starts a session when the ownership lock is acquired", async () => {
    const { manager, sources } = buildManager({ ownership: createInMemoryRoomOwnership() });
    await manager.startForRoom("room-x");
    expect(sources).toHaveLength(1);
    expect(sources[0].connect).toHaveBeenCalledOnce();
    expect(manager.activeRoomCount).toBe(1);
  });

  it("skips when the ownership lock is already held by another worker", async () => {
    const shared = createInMemoryRoomOwnership();
    // Pre-acquire as a sibling worker.
    await shared.acquire("room-x");
    const { manager, sources } = buildManager({ ownership: shared });
    await manager.startForRoom("room-x");
    expect(sources).toHaveLength(0);
    expect(manager.activeRoomCount).toBe(0);
  });

  it("releases the lock when stopForRoom is called", async () => {
    const shared = createInMemoryRoomOwnership();
    const { manager } = buildManager({ ownership: shared });
    await manager.startForRoom("room-x");
    await manager.stopForRoom("room-x");

    // After release, a second start should succeed again.
    const { manager: manager2 } = buildManager({ ownership: shared });
    await manager2.startForRoom("room-x");
    expect(manager2.activeRoomCount).toBe(1);
  });

  it("skips startForRoom when no meeting maps to the room", async () => {
    const ownership = createInMemoryRoomOwnership();
    const { manager } = buildManager({
      ownership,
      resolveMeetingId: async () => null,
    });
    await manager.startForRoom("orphan-room");
    expect(manager.activeRoomCount).toBe(0);
    // Lock should not be held since we never acquired it.
    expect(await ownership.acquire("orphan-room")).toBe(true);
  });

  it("does not double-start the same room within one process", async () => {
    const { manager, sources } = buildManager({ ownership: createInMemoryRoomOwnership() });
    await manager.startForRoom("room-x");
    await manager.startForRoom("room-x");
    expect(sources).toHaveLength(1);
  });

  it("stops the session when the source reports a disconnect", async () => {
    const ownership = createInMemoryRoomOwnership();
    const { manager, sources } = buildManager({ ownership });
    await manager.startForRoom("room-x");
    expect(manager.activeRoomCount).toBe(1);

    sources[0].fireDisconnect("token expired");
    // stopForRoom is awaited asynchronously; drain the microtask queue.
    await new Promise((resolve) => setImmediate(resolve));

    expect(manager.activeRoomCount).toBe(0);
    expect(sources[0].disconnect).toHaveBeenCalled();
    // Lock should be released so another worker can pick the room up.
    expect(await ownership.acquire("room-x")).toBe(true);
  });

  it("releases the lock if session.start throws", async () => {
    const ownership = createInMemoryRoomOwnership();
    const failingSource: RoomAudioSourceFactory = () => {
      return {
        connect: vi.fn(async () => {
          throw new Error("rtc-node boom");
        }),
        disconnect: vi.fn(async () => {}),
        onAudioChunk: () => {},
        onParticipantLeft: () => {},
      };
    };
    const manager = new RealtimeTranscriptionManager({
      apiBaseUrl: "http://api",
      workerSecret: "secret",
      languageCode: "ja-JP",
      ownership,
      resolveMeetingId: async () => "meeting-1",
      createSource: failingSource,
      createTranscriber: () => new FakeTranscriber(),
    });

    await expect(manager.startForRoom("room-x")).rejects.toThrow("rtc-node boom");
    expect(await ownership.acquire("room-x")).toBe(true);
  });
});
