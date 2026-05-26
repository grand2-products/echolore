import { describe, expect, it } from "vitest";
import { type ActiveMeetingSnapshot, selectStaleActiveMeetings } from "./reconcile.js";

const NOW = new Date("2026-05-26T12:00:00.000Z");
const GRACE_MS = 300_000; // 5 min

function meeting(overrides: Partial<ActiveMeetingSnapshot>): ActiveMeetingSnapshot {
  return {
    id: "m1",
    roomName: "room-m1",
    startedAt: new Date(NOW.getTime() - 10 * 60_000).toISOString(), // 10 min ago by default
    ...overrides,
  };
}

describe("selectStaleActiveMeetings", () => {
  it("ends an active meeting whose room is gone and started before the grace window", () => {
    const result = selectStaleActiveMeetings({
      activeMeetings: [meeting({ id: "stale", roomName: "room-stale" })],
      liveRoomNames: ["room-other"],
      now: NOW,
      graceMs: GRACE_MS,
    });

    expect(result.map((m) => m.id)).toEqual(["stale"]);
  });

  it("keeps a meeting whose room is still live (e.g. empty-room countdown)", () => {
    const result = selectStaleActiveMeetings({
      activeMeetings: [meeting({ id: "live", roomName: "room-live" })],
      liveRoomNames: ["room-live"],
      now: NOW,
      graceMs: GRACE_MS,
    });

    expect(result).toEqual([]);
  });

  it("keeps a freshly-activated meeting still inside the grace window", () => {
    const result = selectStaleActiveMeetings({
      activeMeetings: [
        meeting({
          id: "fresh",
          roomName: "room-fresh",
          startedAt: new Date(NOW.getTime() - 60_000).toISOString(), // 1 min ago
        }),
      ],
      liveRoomNames: [],
      now: NOW,
      graceMs: GRACE_MS,
    });

    expect(result).toEqual([]);
  });

  it("ends exactly at the grace boundary", () => {
    const result = selectStaleActiveMeetings({
      activeMeetings: [
        meeting({
          id: "boundary",
          roomName: "room-boundary",
          startedAt: new Date(NOW.getTime() - GRACE_MS).toISOString(),
        }),
      ],
      liveRoomNames: [],
      now: NOW,
      graceMs: GRACE_MS,
    });

    expect(result.map((m) => m.id)).toEqual(["boundary"]);
  });

  it("skips meetings with a null startedAt (unknown age)", () => {
    const result = selectStaleActiveMeetings({
      activeMeetings: [meeting({ id: "nostart", roomName: "room-nostart", startedAt: null })],
      liveRoomNames: [],
      now: NOW,
      graceMs: GRACE_MS,
    });

    expect(result).toEqual([]);
  });

  it("skips meetings with an unparseable startedAt", () => {
    const result = selectStaleActiveMeetings({
      activeMeetings: [meeting({ id: "bad", roomName: "room-bad", startedAt: "not-a-date" })],
      liveRoomNames: [],
      now: NOW,
      graceMs: GRACE_MS,
    });

    expect(result).toEqual([]);
  });

  it("returns only the stale meetings from a mixed list", () => {
    const result = selectStaleActiveMeetings({
      activeMeetings: [
        meeting({ id: "stale-a", roomName: "room-a" }),
        meeting({ id: "live-b", roomName: "room-b" }),
        meeting({
          id: "fresh-c",
          roomName: "room-c",
          startedAt: new Date(NOW.getTime() - 30_000).toISOString(),
        }),
        meeting({ id: "stale-d", roomName: "room-d" }),
      ],
      liveRoomNames: ["room-b"],
      now: NOW,
      graceMs: GRACE_MS,
    });

    expect(result.map((m) => m.id).sort()).toEqual(["stale-a", "stale-d"]);
  });
});
