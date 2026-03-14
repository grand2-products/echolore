import { Hono } from "hono";
import { and, eq, exists, gte, sql } from "drizzle-orm";
import { withErrorHandler } from "../lib/api-error.js";
import { db } from "../db/index.js";
import { auditLogs, meetings, summaries, transcripts } from "../db/schema.js";

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

metricsRoutes.get("/overview", withErrorHandler(async (c) => {
  const rawWindowDays = Number(c.req.query("windowDays") ?? "30");
  const windowDays = Number.isFinite(rawWindowDays) ? Math.max(1, Math.min(365, rawWindowDays)) : 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [mauRow] = await db
    .select({
      value: sql<number>`count(distinct ${auditLogs.actorUserId})`,
    })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "auth.authenticated"), gte(auditLogs.createdAt, since)));

  const [searchRow] = await db
    .select({
      total: sql<number>`count(*)`,
      success: sql<number>`sum(case when coalesce((${auditLogs.metadata} ->> 'resultCount')::int, 0) > 0 then 1 else 0 end)`,
    })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "search.query"), gte(auditLogs.createdAt, since)));

  const [meetingRow] = await db
    .select({
      total: sql<number>`count(*)`,
      withMinutes: sql<number>`sum(case when ${exists(
        db
          .select({ id: transcripts.id })
          .from(transcripts)
          .where(eq(transcripts.meetingId, meetings.id))
      )} or ${exists(
        db
          .select({ id: summaries.id })
          .from(summaries)
          .where(eq(summaries.meetingId, meetings.id))
      )} then 1 else 0 end)`,
    })
    .from(meetings)
    .where(gte(meetings.createdAt, since));

  const [securityRow] = await db
    .select({
      authRejectedTotal: sql<number>`sum(case when ${auditLogs.action} = 'auth.rejected' then 1 else 0 end)`,
      authzDeniedTotal: sql<number>`sum(case when ${auditLogs.action} = 'authz.denied' then 1 else 0 end)`,
    })
    .from(auditLogs)
    .where(
      and(
        gte(auditLogs.createdAt, since),
        sql<boolean>`${auditLogs.action} in ('auth.rejected', 'authz.denied')`
      )
    );

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
}, "ADMIN_KPI_OVERVIEW_FAILED", "Failed to fetch KPI overview"));
