import { describe, expect, it, vi } from "vitest";
import { reconcileOrphanRooms } from "./reconcile.js";

describe("reconcileOrphanRooms", () => {
  it("calls startForRoom for every live room reported by LiveKit", async () => {
    const manager = {
      startForRoom: vi.fn().mockResolvedValue(undefined),
    };
    await reconcileOrphanRooms({
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub
      manager: manager as any,
      listLiveRoomNames: async () => ["room-a", "room-b", "room-c"],
    });

    expect(manager.startForRoom).toHaveBeenCalledTimes(3);
    expect(manager.startForRoom).toHaveBeenCalledWith("room-a");
    expect(manager.startForRoom).toHaveBeenCalledWith("room-b");
    expect(manager.startForRoom).toHaveBeenCalledWith("room-c");
  });

  it("does not call startForRoom when no live rooms exist", async () => {
    const manager = {
      startForRoom: vi.fn().mockResolvedValue(undefined),
    };
    await reconcileOrphanRooms({
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub
      manager: manager as any,
      listLiveRoomNames: async () => [],
    });
    expect(manager.startForRoom).not.toHaveBeenCalled();
  });

  it("logs and short-circuits when listing rooms throws", async () => {
    const manager = {
      startForRoom: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      reconcileOrphanRooms({
        // biome-ignore lint/suspicious/noExplicitAny: minimal stub
        manager: manager as any,
        listLiveRoomNames: async () => {
          throw new Error("livekit unreachable");
        },
      })
    ).resolves.toBeUndefined();
    expect(manager.startForRoom).not.toHaveBeenCalled();
  });

  it("does not throw when one startForRoom call fails", async () => {
    const manager = {
      startForRoom: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("session boom"))
        .mockResolvedValueOnce(undefined),
    };
    await expect(
      reconcileOrphanRooms({
        // biome-ignore lint/suspicious/noExplicitAny: minimal stub
        manager: manager as any,
        listLiveRoomNames: async () => ["room-a", "room-b", "room-c"],
      })
    ).resolves.toBeUndefined();
    expect(manager.startForRoom).toHaveBeenCalledTimes(3);
  });
});
