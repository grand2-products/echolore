import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/auth.js";
import { metricsRoutes } from "./metrics.js";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
  },
}));

vi.mock("../db/index.js", () => ({
  db: dbMock,
}));

function createApp() {
  const app = new Hono<AppEnv>();
  app.route("/api/admin/metrics", metricsRoutes);
  return app;
}

describe("metricsRoutes", () => {
  beforeEach(() => {
    dbMock.select.mockReset();
  });

  it("returns security KPI totals and threshold states in overview", async () => {
    const app = createApp();
    const selectResults = [
      [{ value: 8 }],
      [{ total: 10, success: 7 }],
      [],
      [],
      [{ total: 4, withMinutes: 3 }],
      [{ authRejectedTotal: 6, authzDeniedTotal: 11 }],
    ];

    dbMock.select.mockImplementation(() => {
      const nextResult = selectResults.shift() ?? [];
      return {
        from: vi.fn(() => ({
          where: vi.fn(async () => nextResult),
        })),
      };
    });

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
