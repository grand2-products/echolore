import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/auth.js";
import { metricsRoutes } from "./metrics.js";

const { countActiveUsersMock, getSearchStatsMock, getMeetingStatsMock, getSecurityStatsMock } =
  vi.hoisted(() => ({
    countActiveUsersMock: vi.fn(),
    getSearchStatsMock: vi.fn(),
    getMeetingStatsMock: vi.fn(),
    getSecurityStatsMock: vi.fn(),
  }));

vi.mock("../repositories/metrics/metrics-repository.js", () => ({
  countActiveUsers: countActiveUsersMock,
  getSearchStats: getSearchStatsMock,
  getMeetingStats: getMeetingStatsMock,
  getSecurityStats: getSecurityStatsMock,
}));

function createApp() {
  const app = new Hono<AppEnv>();
  app.route("/api/admin/metrics", metricsRoutes);
  return app;
}

describe("metricsRoutes", () => {
  beforeEach(() => {
    countActiveUsersMock.mockReset();
    getSearchStatsMock.mockReset();
    getMeetingStatsMock.mockReset();
    getSecurityStatsMock.mockReset();
  });

  it("returns security KPI totals and threshold states in overview", async () => {
    const app = createApp();

    countActiveUsersMock.mockResolvedValue({ value: 8 });
    getSearchStatsMock.mockResolvedValue({ total: 10, success: 7 });
    getMeetingStatsMock.mockResolvedValue({ total: 4, withMinutes: 3 });
    getSecurityStatsMock.mockResolvedValue({ authRejectedTotal: 6, authzDeniedTotal: 11 });

    const response = await app.request("http://localhost/api/admin/metrics/overview?windowDays=30");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        windowDays: 30,
        metrics: expect.objectContaining({
          mau: 8,
          searchTotal: 10,
          searchSuccess: 7,
          meetingsTotal: 4,
          meetingsWithMinutes: 3,
        }),
        security: {
          authRejectedTotal: 6,
          authzDeniedTotal: 11,
        },
        alerts: {
          authRejected: {
            warningThreshold: 5,
            criticalThreshold: 20,
            warning: true,
            critical: false,
          },
          authzDenied: {
            warningThreshold: 10,
            criticalThreshold: 50,
            warning: true,
            critical: false,
          },
        },
      })
    );
  });
});
