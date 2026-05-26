import { beforeEach, describe, expect, it, vi } from "vitest";

const { getValkeyMock } = vi.hoisted(() => ({
  getValkeyMock: vi.fn(),
}));

vi.mock("../../lib/valkey.js", () => ({
  getValkey: getValkeyMock,
}));

describe("autonomous-leader", () => {
  beforeEach(() => {
    vi.resetModules();
    getValkeyMock.mockReset();
  });

  it("degrades to leader (true) when Valkey is unavailable", async () => {
    getValkeyMock.mockReturnValue(null);
    const { tryAcquireLeadership } = await import("./autonomous-leader.js");

    await expect(tryAcquireLeadership()).resolves.toBe(true);
  });

  it("acquires leadership when the lock is free (SET NX returns OK)", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    getValkeyMock.mockReturnValue({ set, get: vi.fn(), del: vi.fn() });
    const { tryAcquireLeadership } = await import("./autonomous-leader.js");

    await expect(tryAcquireLeadership(1000)).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith(
      "echolore:autonomous-eval:leader",
      expect.any(String),
      "PX",
      1000,
      "NX"
    );
  });

  it("yields (false) when another instance holds the lock", async () => {
    const set = vi.fn().mockResolvedValue(null); // NX failed — already held
    const get = vi.fn().mockResolvedValue("some-other-instance");
    getValkeyMock.mockReturnValue({ set, get, del: vi.fn() });
    const { tryAcquireLeadership } = await import("./autonomous-leader.js");

    await expect(tryAcquireLeadership()).resolves.toBe(false);
  });

  it("renews the TTL when this instance already holds the lock", async () => {
    const { getInstanceId } = await import("./autonomous-leader.js");
    const selfId = getInstanceId();

    const set = vi.fn().mockResolvedValue(null); // NX failed — we already hold it
    const get = vi.fn().mockResolvedValue(selfId);
    getValkeyMock.mockReturnValue({ set, get, del: vi.fn() });
    const { tryAcquireLeadership } = await import("./autonomous-leader.js");

    await expect(tryAcquireLeadership(5000)).resolves.toBe(true);
    // Second set call refreshes TTL without NX.
    expect(set).toHaveBeenLastCalledWith("echolore:autonomous-eval:leader", selfId, "PX", 5000);
  });

  it("degrades to leader (true) when Valkey throws", async () => {
    const set = vi.fn().mockRejectedValue(new Error("connection refused"));
    getValkeyMock.mockReturnValue({ set, get: vi.fn(), del: vi.fn() });
    const { tryAcquireLeadership } = await import("./autonomous-leader.js");

    await expect(tryAcquireLeadership()).resolves.toBe(true);
  });
});
