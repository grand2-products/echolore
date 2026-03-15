import { and, eq, exists, gte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditLogs, meetings, summaries, transcripts } from "../../db/schema.js";

export async function countActiveUsers(since: Date) {
  const [row] = await db
    .select({
      value: sql<number>`count(distinct ${auditLogs.actorUserId})`,
    })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "auth.authenticated"), gte(auditLogs.createdAt, since)));

  return row;
}

export async function getSearchStats(since: Date) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      success: sql<number>`sum(case when coalesce((${auditLogs.metadata} ->> 'resultCount')::int, 0) > 0 then 1 else 0 end)`,
    })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "search.query"), gte(auditLogs.createdAt, since)));

  return row;
}

export async function getMeetingStats(since: Date) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      withMinutes: sql<number>`sum(case when ${exists(
        db
          .select({ id: transcripts.id })
          .from(transcripts)
          .where(eq(transcripts.meetingId, meetings.id))
      )} or ${exists(
        db.select({ id: summaries.id }).from(summaries).where(eq(summaries.meetingId, meetings.id))
      )} then 1 else 0 end)`,
    })
    .from(meetings)
    .where(gte(meetings.createdAt, since));

  return row;
}

export async function getSecurityStats(since: Date) {
  const [row] = await db
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

  return row;
}
