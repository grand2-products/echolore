import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import type { MarketingAsset, MarketingAssetAccess } from "../../db/schema.js";

export type AssetInput = {
  type: string;
  name: string;
  externalId?: string | null;
  purpose?: string | null;
  ownerEntity?: string | null;
  billingEntity?: string | null;
  primaryOwnerUserId?: string | null;
  secondaryOwnerUserId?: string | null;
  agencyName?: string | null;
  agencyRelationship?: string | null;
  relatedAssetIds?: string[];
  measurementIds?: string[];
  consoleUrl?: string | null;
  publicUrl?: string | null;
  secretReference?: string | null;
  emergencyContact?: string | null;
  wikiPageId?: string | null;
  notes?: string | null;
  status?: string;
  verificationIntervalDays?: number;
};

export async function listAssets(): Promise<MarketingAsset[]> {
  return db.selectFrom("marketing_assets").selectAll().orderBy("type").orderBy("name").execute();
}

export async function getAssetById(id: string): Promise<MarketingAsset | null> {
  return (
    (await db.selectFrom("marketing_assets").selectAll().where("id", "=", id).executeTakeFirst()) ??
    null
  );
}

export async function listAssetsByIds(ids: string[]): Promise<MarketingAsset[]> {
  if (ids.length === 0) return [];
  return db.selectFrom("marketing_assets").selectAll().where("id", "in", ids).execute();
}

export async function createAsset(input: AssetInput, actorUserId: string): Promise<MarketingAsset> {
  const now = new Date();
  return db
    .insertInto("marketing_assets")
    .values({
      id: `mka_${nanoid(16)}`,
      ...input,
      relatedAssetIds: input.relatedAssetIds ?? [],
      measurementIds: input.measurementIds ?? [],
      createdByUserId: actorUserId,
      lastVerifiedAt: null,
      lastVerifiedByUserId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateAsset(
  id: string,
  input: Partial<AssetInput>
): Promise<MarketingAsset | null> {
  return (
    (await db
      .updateTable("marketing_assets")
      .set({ ...input, updatedAt: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function markAssetVerified(id: string, actorUserId: string) {
  return (
    (await db
      .updateTable("marketing_assets")
      .set({ lastVerifiedAt: new Date(), lastVerifiedByUserId: actorUserId, updatedAt: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function deleteAsset(id: string): Promise<void> {
  await db.deleteFrom("marketing_assets").where("id", "=", id).execute();
}

// ─── Access entries (権限一覧) ────────────────────────────────────

export async function listAccessForAsset(assetId: string): Promise<MarketingAssetAccess[]> {
  return db
    .selectFrom("marketing_asset_access")
    .selectAll()
    .where("assetId", "=", assetId)
    .orderBy("createdAt")
    .execute();
}

export async function listActiveAccessEntries(): Promise<MarketingAssetAccess[]> {
  return db
    .selectFrom("marketing_asset_access")
    .selectAll()
    .where("revokedAt", "is", null)
    .execute();
}

export async function createAccessEntry(input: {
  assetId: string;
  principal: string;
  principalType: string;
  role: string;
  scope: string | null;
  expiresAt: Date | null;
  approvedByUserId: string;
}): Promise<MarketingAssetAccess> {
  return db
    .insertInto("marketing_asset_access")
    .values({
      id: `mkx_${nanoid(16)}`,
      ...input,
      revokedAt: null,
      createdAt: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function revokeAccessEntry(
  assetId: string,
  accessId: string
): Promise<MarketingAssetAccess | null> {
  return (
    (await db
      .updateTable("marketing_asset_access")
      .set({ revokedAt: new Date() })
      .where("id", "=", accessId)
      .where("assetId", "=", assetId)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}
