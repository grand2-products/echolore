import { sql } from "kysely";
import { db } from "../../db/index.js";

export async function countActiveUsers(since: Date) {
  const row = await db
    .selectFrom("audit_logs")
    .select(sql<number>`count(distinct ${sql.ref("actorUserId")})`.as("value"))
    .where("action", "=", "auth.authenticated")
    .where("createdAt", ">=", since)
    .executeTakeFirst();

  return row;
}

export async function getSearchStats(since: Date) {
  const row = await db
    .selectFrom("audit_logs")
    .select([
      sql<number>`count(*)`.as("total"),
      sql<number>`sum(case when coalesce((${sql.ref("metadata")} ->> 'resultCount')::int, 0) > 0 then 1 else 0 end)`.as(
        "success"
      ),
    ])
    .where("action", "=", "search.query")
    .where("createdAt", ">=", since)
    .executeTakeFirst();

  return row;
}

export async function getMeetingStats(since: Date) {
  const row = await db
    .selectFrom("meetings")
    .select([
      sql<number>`count(*)`.as("total"),
      sql<number>`sum(case when exists(
        select 1 from transcripts where transcripts.meetingId = meetings.id
      ) or exists(
        select 1 from summaries where summaries.meetingId = meetings.id
      ) then 1 else 0 end)`.as("withMinutes"),
    ])
    .where("createdAt", ">=", since)
    .executeTakeFirst();

  return row;
}

export async function getSecurityStats(since: Date) {
  const row = await db
    .selectFrom("audit_logs")
    .select([
      sql<number>`sum(case when ${sql.ref("action")} = 'auth.rejected' then 1 else 0 end)`.as(
        "authRejectedTotal"
      ),
      sql<number>`sum(case when ${sql.ref("action")} = 'authz.denied' then 1 else 0 end)`.as(
        "authzDeniedTotal"
      ),
    ])
    .where("createdAt", ">=", since)
    .where((eb) => eb(sql.ref("action"), "in", ["auth.rejected", "authz.denied"]))
    .executeTakeFirst();

  return row;
}
