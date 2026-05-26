import { beforeEach, describe, expect, it, vi } from "vitest";

const { getValkeyMock } = vi.hoisted(() => ({
  getValkeyMock: vi.fn(),
}));

vi.mock("../../lib/valkey.js", () => ({
  getValkey: getValkeyMock,
}));

const LEADER_KEY = "echolore:autonomous-eval:leader";

describe("autonomous-leader", () => {
  beforeEach(() => {
    vi.resetModules();
    getValkeyMock.mockReset();
  });

  describe("tryAcquireLeadership", () => {
    it("degrades to leader (true) when Valkey is unavailable", async () => {
      getValkeyMock.mockReturnValue(null);
      const { tryAcquireLeadership } = await import("./autonomous-leader.js");

      await expect(tryAcquireLeadership()).resolves.toBe(true);
    });

    it("becomes leader when the atomic acquire/renew script returns 1", async () => {
      const evalFn = vi.fn().mockResolvedValue(1);
      getValkeyMock.mockReturnValue({ eval: evalFn });
      const { tryAcquireLeadership, getInstanceId } = await import("./autonomous-leader.js");

      await expect(tryAcquireLeadership(1000)).resolves.toBe(true);
      // Single atomic script: <lua>, numkeys=1, key, instanceId, ttl
      expect(evalFn).toHaveBeenCalledWith(
        expect.stringContaining("redis.call('set'"),
        1,
        LEADER_KEY,
        getInstanceId(),
        "1000"
      );
    });

    it("yields (false) when another instance holds the lock (script returns 0)", async () => {
      const evalFn = vi.fn().mockResolvedValue(0);
      getValkeyMock.mockReturnValue({ eval: evalFn });
      const { tryAcquireLeadership } = await import("./autonomous-leader.js");

      await expect(tryAcquireLeadership()).resolves.toBe(false);
    });

    it("degrades to leader (true) when Valkey throws", async () => {
      const evalFn = vi.fn().mockRejectedValue(new Error("connection refused"));
      getValkeyMock.mockReturnValue({ eval: evalFn });
      const { tryAcquireLeadership } = await import("./autonomous-leader.js");

      await expect(tryAcquireLeadership()).resolves.toBe(true);
    });
  });

  describe("releaseLeadership", () => {
    it("is a no-op when Valkey is unavailable", async () => {
      getValkeyMock.mockReturnValue(null);
      const { releaseLeadership } = await import("./autonomous-leader.js");

      await expect(releaseLeadership()).resolves.toBeUndefined();
    });

    it("runs the CAS-delete script with this instance's id", async () => {
      const evalFn = vi.fn().mockResolvedValue(1);
      getValkeyMock.mockReturnValue({ eval: evalFn });
      const { releaseLeadership, getInstanceId } = await import("./autonomous-leader.js");

      await releaseLeadership();
      expect(evalFn).toHaveBeenCalledWith(
        expect.stringContaining("redis.call('del'"),
        1,
        LEADER_KEY,
        getInstanceId()
      );
    });

    it("swallows Valkey errors during release", async () => {
      const evalFn = vi.fn().mockRejectedValue(new Error("down"));
      getValkeyMock.mockReturnValue({ eval: evalFn });
      const { releaseLeadership } = await import("./autonomous-leader.js");

      await expect(releaseLeadership()).resolves.toBeUndefined();
    });
  });
});
