import { Hono } from "hono";
import { withErrorHandler } from "../lib/api-error.js";
import { ONE_DAY_MS } from "../lib/time.js";
import {
  countActiveUsers,
  getMeetingStats,
  getSearchStats,
  getSecurityStats,
} from "../repositories/metrics/metrics-repository.js";

export const metricsRoutes = new Hono();

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
};

const SECURITY_ALERT_THRESHOLDS = {
  authRejectedWarning: 5,
  authRejectedCritical: 20,
  authzDeniedWarning: 10,
  authzDeniedCritical: 50,
};

metricsRoutes.get(
  "/overview",
  withErrorHandler(
    async (c) => {
      const rawWindowDays = Number(c.req.query("windowDays") ?? "30");
      const windowDays = Number.isFinite(rawWindowDays)
        ? Math.max(1, Math.min(365, rawWindowDays))
        : 30;
      const since = new Date(Date.now() - windowDays * ONE_DAY_MS);

      const [mauRow, searchRow, meetingRow, securityRow] = await Promise.all([
        countActiveUsers(since),
        getSearchStats(since),
        getMeetingStats(since),
        getSecurityStats(since),
      ]);

      const mau = toNumber(mauRow?.value);
      const searchTotal = toNumber(searchRow?.total);
      const searchSuccess = toNumber(searchRow?.success);
      const meetingsTotal = toNumber(meetingRow?.total);
      const meetingsWithMinutes = toNumber(meetingRow?.withMinutes);
      const authRejectedTotal = toNumber(securityRow?.authRejectedTotal);
      const authzDeniedTotal = toNumber(securityRow?.authzDeniedTotal);

      const searchSuccessRate = searchTotal > 0 ? searchSuccess / searchTotal : 0;
      const minutesUtilizationRate = meetingsTotal > 0 ? meetingsWithMinutes / meetingsTotal : 0;

      return c.json({
        windowDays,
        since: since.toISOString(),
        metrics: {
          mau,
          searchTotal,
          searchSuccess,
          searchSuccessRate,
          meetingsTotal,
          meetingsWithMinutes,
          minutesUtilizationRate,
        },
        security: {
          authRejectedTotal,
          authzDeniedTotal,
        },
        alerts: {
          authRejected: {
            warningThreshold: SECURITY_ALERT_THRESHOLDS.authRejectedWarning,
            criticalThreshold: SECURITY_ALERT_THRESHOLDS.authRejectedCritical,
            warning: authRejectedTotal >= SECURITY_ALERT_THRESHOLDS.authRejectedWarning,
            critical: authRejectedTotal >= SECURITY_ALERT_THRESHOLDS.authRejectedCritical,
          },
          authzDenied: {
            warningThreshold: SECURITY_ALERT_THRESHOLDS.authzDeniedWarning,
            criticalThreshold: SECURITY_ALERT_THRESHOLDS.authzDeniedCritical,
            warning: authzDeniedTotal >= SECURITY_ALERT_THRESHOLDS.authzDeniedWarning,
            critical: authzDeniedTotal >= SECURITY_ALERT_THRESHOLDS.authzDeniedCritical,
          },
        },
      });
    },
    "ADMIN_KPI_OVERVIEW_FAILED",
    "Failed to fetch KPI overview"
  )
);
