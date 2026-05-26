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
      const { releaseLeadership, getInstanceId, tryAcquireLeadership } = await import(
        "./autonomous-leader.js"
      );

      // Acquire first so the release transition is taken (mirrors real flow).
      await tryAcquireLeadership();
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

  describe("structured logging (H3)", () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    const parseLogged = (calls: unknown[][]): Array<Record<string, unknown>> => {
      const out: Array<Record<string, unknown>> = [];
      for (const args of calls) {
        const first = args[0];
        if (typeof first !== "string") continue;
        try {
          const parsed = JSON.parse(first);
          if (parsed && typeof parsed === "object") out.push(parsed as Record<string, unknown>);
        } catch {
          // ignore non-JSON noise
        }
      }
      return out;
    };

    it("emits meeting-leader.acquired on first successful acquisition", async () => {
      const evalFn = vi.fn().mockResolvedValue(1);
      getValkeyMock.mockReturnValue({ eval: evalFn });
      const { tryAcquireLeadership, getInstanceId } = await import("./autonomous-leader.js");

      await tryAcquireLeadership(1000);
      const logs = parseLogged(logSpy.mock.calls);
      const acquired = logs.find((l) => l.event === "meeting-leader.acquired");
      expect(acquired).toBeDefined();
      expect(acquired?.instanceId).toBe(getInstanceId());
      expect(acquired?.lockKey).toBe(LEADER_KEY);
      expect(acquired?.ttlMs).toBe(1000);
    });

    it("emits meeting-leader.lost when the lock changes hands", async () => {
      const evalFn = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      getValkeyMock.mockReturnValue({ eval: evalFn });
      const { tryAcquireLeadership } = await import("./autonomous-leader.js");

      await tryAcquireLeadership();
      logSpy.mockClear();
      await tryAcquireLeadership();
      const logs = parseLogged(logSpy.mock.calls);
      expect(logs.some((l) => l.event === "meeting-leader.lost")).toBe(true);
    });

    it("emits meeting-leader.acquire-error when Lua eval throws", async () => {
      const evalFn = vi.fn().mockRejectedValue(new Error("connection refused"));
      getValkeyMock.mockReturnValue({ eval: evalFn });
      const { tryAcquireLeadership } = await import("./autonomous-leader.js");

      await tryAcquireLeadership();
      const logs = parseLogged(logSpy.mock.calls);
      const errLog = logs.find((l) => l.event === "meeting-leader.acquire-error");
      expect(errLog).toBeDefined();
      expect(errLog?.error).toBe("connection refused");
    });
  });
});
