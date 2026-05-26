import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildOwnership, createInMemoryRoomOwnership } from "./room-ownership.js";

describe("createInMemoryRoomOwnership", () => {
  it("grants ownership to the first caller and rejects subsequent ones", async () => {
    const reg = createInMemoryRoomOwnership();
    expect(await reg.acquire("room-x")).toBe(true);
    expect(await reg.acquire("room-x")).toBe(false);
  });

  it("releases the lock so another caller can re-acquire", async () => {
    const reg = createInMemoryRoomOwnership();
    await reg.acquire("room-x");
    await reg.release("room-x");
    expect(await reg.acquire("room-x")).toBe(true);
  });

  it("refresh reports whether the lock is still ours", async () => {
    const reg = createInMemoryRoomOwnership();
    expect(await reg.refresh("room-x")).toBe(false);
    await reg.acquire("room-x");
    expect(await reg.refresh("room-x")).toBe(true);
    await reg.release("room-x");
    expect(await reg.refresh("room-x")).toBe(false);
  });
});

describe("buildOwnership (Valkey-backed)", () => {
  let store: Map<string, string>;
  let setMock: ReturnType<typeof vi.fn>;
  let evalMock: ReturnType<typeof vi.fn>;
  let quitMock: ReturnType<typeof vi.fn>;
  let client: Parameters<typeof buildOwnership>[0];

  beforeEach(() => {
    store = new Map();
    setMock = vi.fn(
      async (key: string, value: string, _mode: string, _ttl: number, flag: string) => {
        if (flag === "NX" && store.has(key)) return null;
        store.set(key, value);
        return "OK" as const;
      }
    );
    evalMock = vi.fn(async (script: string, _numKeys: number, ...args: (string | number)[]) => {
      const key = String(args[0]);
      const value = String(args[1]);
      if (script.includes("DEL")) {
        if (store.get(key) === value) {
          store.delete(key);
          return 1;
        }
        return 0;
      }
      if (script.includes("PEXPIRE")) {
        return store.get(key) === value ? 1 : 0;
      }
      return 0;
    });
    quitMock = vi.fn();
    client = {
      set: setMock,
      eval: evalMock,
      quit: quitMock,
    };
  });

  it("only one worker can hold the lock at a time", async () => {
    const a = buildOwnership(client, { workerId: "worker-a" });
    const b = buildOwnership(client, { workerId: "worker-b" });

    expect(await a.acquire("room-x")).toBe(true);
    expect(await b.acquire("room-x")).toBe(false);

    await a.release("room-x");
    expect(await b.acquire("room-x")).toBe(true);
  });

  it("refresh extends the TTL only when the lock is still ours", async () => {
    const a = buildOwnership(client, { workerId: "worker-a" });
    const b = buildOwnership(client, { workerId: "worker-b" });

    await a.acquire("room-x");
    expect(await a.refresh("room-x")).toBe(true);
    // worker-b never owned this room.
    expect(await b.refresh("room-x")).toBe(false);
  });

  it("release does not nuke a lock owned by a different worker", async () => {
    const a = buildOwnership(client, { workerId: "worker-a" });
    const b = buildOwnership(client, { workerId: "worker-b" });

    await a.acquire("room-x");
    await b.release("room-x"); // wrong owner, no-op
    expect(await b.acquire("room-x")).toBe(false);
  });
});
