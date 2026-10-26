import type { MarketingDashboardDefinition } from "@echolore/shared/contracts";
import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import type { MarketingDashboard, MarketingDashboardRevision } from "../../db/schema.js";

export async function listDashboards(): Promise<MarketingDashboard[]> {
  return db.selectFrom("marketing_dashboards").selectAll().orderBy("name").execute();
}

export async function getDashboardById(id: string): Promise<MarketingDashboard | null> {
  return (
    (await db
      .selectFrom("marketing_dashboards")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst()) ?? null
  );
}

/** Creates the dashboard and its first revision in one transaction. */
export async function createDashboard(
  definition: MarketingDashboardDefinition,
  changeNote: string,
  actorUserId: string
): Promise<MarketingDashboard> {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const dashboard = await trx
      .insertInto("marketing_dashboards")
      .values({
        id: `mkd_${nanoid(16)}`,
        name: definition.name,
        description: definition.description,
        wikiPageId: definition.wikiPageId,
        defaultRange: definition.defaultRange,
        widgets: definition.widgets,
        version: 1,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("marketing_dashboard_revisions")
      .values({
        id: `mkdr_${nanoid(16)}`,
        dashboardId: dashboard.id,
        version: 1,
        definition: definition as unknown as Record<string, unknown>,
        changeNote,
        authorUserId: actorUserId,
        createdAt: now,
      })
      .execute();
    return dashboard;
  });
}

/**
 * Saves a new version. `expectedVersion` guards against lost updates when
 * two people edit the same dashboard (returns null on conflict).
 */
export async function updateDashboard(
  id: string,
  definition: MarketingDashboardDefinition,
  changeNote: string,
  actorUserId: string,
  expectedVersion: number | null
): Promise<MarketingDashboard | null> {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom("marketing_dashboards")
      .select(["id", "version"])
      .where("id", "=", id)
      .forUpdate()
      .executeTakeFirst();
    if (!current) return null;
    if (expectedVersion !== null && current.version !== expectedVersion) return null;
    const nextVersion = current.version + 1;
    const dashboard = await trx
      .updateTable("marketing_dashboards")
      .set({
        name: definition.name,
        description: definition.description,
        wikiPageId: definition.wikiPageId,
        defaultRange: definition.defaultRange,
        widgets: definition.widgets,
        version: nextVersion,
        updatedByUserId: actorUserId,
        updatedAt: now,
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("marketing_dashboard_revisions")
      .values({
        id: `mkdr_${nanoid(16)}`,
        dashboardId: id,
        version: nextVersion,
        definition: definition as unknown as Record<string, unknown>,
        changeNote,
        authorUserId: actorUserId,
        createdAt: now,
      })
      .execute();
    return dashboard;
  });
}

export async function deleteDashboard(id: string): Promise<void> {
  await db.deleteFrom("marketing_dashboards").where("id", "=", id).execute();
}

export async function listDashboardRevisions(
  dashboardId: string
): Promise<MarketingDashboardRevision[]> {
  return db
    .selectFrom("marketing_dashboard_revisions")
    .selectAll()
    .where("dashboardId", "=", dashboardId)
    .orderBy("version", "desc")
    .limit(100)
    .execute();
}

export async function getDashboardRevision(
  dashboardId: string,
  version: number
): Promise<MarketingDashboardRevision | null> {
  return (
    (await db
      .selectFrom("marketing_dashboard_revisions")
      .selectAll()
      .where("dashboardId", "=", dashboardId)
      .where("version", "=", version)
      .executeTakeFirst()) ?? null
  );
}
