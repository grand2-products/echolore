import { MarketingPermission, normalizeAssetIdentifiers } from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import { auditAction } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/auth.js";
import { requireMarketingPermission } from "../../policies/marketing-policy.js";
import {
  createAccessEntry,
  createAsset,
  deleteAsset,
  getAssetById,
  listAccessForAsset,
  listAssets,
  listAssetsByIds,
  markAssetVerified,
  revokeAccessEntry,
  updateAsset,
} from "../../repositories/marketing/marketing-asset-repository.js";
import {
  getUserNameMap,
  pageExists,
  userExists,
} from "../../repositories/marketing/marketing-knowledge-repository.js";
import { toAssetAccessDto, toAssetDto } from "../../services/marketing/marketing-dto.js";
import { createAssetAccessSchema, upsertAssetSchema } from "./schemas.js";

export const marketingAssetRoutes = new Hono<AppEnv>();

const assetUserIds = (a: {
  primaryOwnerUserId: string | null;
  secondaryOwnerUserId: string | null;
  lastVerifiedByUserId: string | null;
}) => [a.primaryOwnerUserId, a.secondaryOwnerUserId, a.lastVerifiedByUserId];

/** References must point to existing records; returns an error message or null. */
async function validateReferences(
  input: {
    primaryOwnerUserId?: string | null;
    secondaryOwnerUserId?: string | null;
    wikiPageId?: string | null;
    relatedAssetIds?: string[];
  },
  selfId?: string
): Promise<string | null> {
  for (const userId of [input.primaryOwnerUserId, input.secondaryOwnerUserId]) {
    if (userId && !(await userExists(userId))) return `User not found: ${userId}`;
  }
  if (input.primaryOwnerUserId && input.primaryOwnerUserId === input.secondaryOwnerUserId) {
    return "Primary and secondary owner must be different people";
  }
  if (input.wikiPageId && !(await pageExists(input.wikiPageId))) return "Wiki page not found";
  if (input.relatedAssetIds?.length) {
    if (selfId && input.relatedAssetIds.includes(selfId)) return "An asset cannot relate to itself";
    const found = await listAssetsByIds(input.relatedAssetIds);
    if (found.length !== new Set(input.relatedAssetIds).size) return "Related asset not found";
  }
  return null;
}

marketingAssetRoutes.get(
  "/",
  withErrorHandler("MARKETING_ASSETS_LIST_FAILED", "Failed to list assets"),
  async (c) => {
    const assets = await listAssets();
    const names = await getUserNameMap(assets.flatMap(assetUserIds));
    return c.json(assets.map((a) => toAssetDto(a, names)));
  }
);

marketingAssetRoutes.post(
  "/",
  requireMarketingPermission(MarketingPermission.Operate),
  zValidator("json", upsertAssetSchema),
  withErrorHandler("MARKETING_ASSET_CREATE_FAILED", "Failed to create asset"),
  async (c) => {
    const input = c.req.valid("json");
    const identifiers = normalizeAssetIdentifiers(input.type, input.identifiers ?? {});
    if (!identifiers.ok)
      return jsonError(c, 400, "MARKETING_INVALID_IDENTIFIER", identifiers.message);
    const error = await validateReferences(input);
    if (error) return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", error);
    const asset = await createAsset({ ...input, identifiers: identifiers.value }, c.get("user").id);
    await auditAction(c, "marketing.asset.create", "marketing-asset", asset.id, {
      type: asset.type,
      name: asset.name,
    });
    const names = await getUserNameMap(assetUserIds(asset));
    return c.json(toAssetDto(asset, names), 201);
  }
);

marketingAssetRoutes.get(
  "/:id",
  withErrorHandler("MARKETING_ASSET_FETCH_FAILED", "Failed to fetch asset"),
  async (c) => {
    const asset = await getAssetById(c.req.param("id"));
    if (!asset) return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    const access = await listAccessForAsset(asset.id);
    const names = await getUserNameMap([
      ...assetUserIds(asset),
      ...access.map((a) => a.approvedByUserId),
    ]);
    return c.json({
      asset: toAssetDto(asset, names),
      access: access.map((a) => toAssetAccessDto(a, names)),
    });
  }
);

marketingAssetRoutes.put(
  "/:id",
  requireMarketingPermission(MarketingPermission.Operate),
  zValidator("json", upsertAssetSchema),
  withErrorHandler("MARKETING_ASSET_UPDATE_FAILED", "Failed to update asset"),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    let identifiers: Record<string, string> | undefined;
    if (input.identifiers !== undefined) {
      const normalized = normalizeAssetIdentifiers(input.type, input.identifiers);
      if (!normalized.ok) {
        return jsonError(c, 400, "MARKETING_INVALID_IDENTIFIER", normalized.message);
      }
      identifiers = normalized.value;
    }
    const error = await validateReferences(input, id);
    if (error) return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", error);
    const { identifiers: _ignored, ...rest } = input;
    const asset = await updateAsset(
      id,
      identifiers !== undefined ? { ...rest, identifiers } : rest
    );
    if (!asset) return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    await auditAction(c, "marketing.asset.update", "marketing-asset", id, {
      fields: Object.keys(input),
    });
    const names = await getUserNameMap(assetUserIds(asset));
    return c.json(toAssetDto(asset, names));
  }
);

marketingAssetRoutes.delete(
  "/:id",
  requireMarketingPermission(MarketingPermission.Manage),
  withErrorHandler("MARKETING_ASSET_DELETE_FAILED", "Failed to delete asset"),
  async (c) => {
    const id = c.req.param("id");
    const asset = await getAssetById(id);
    if (!asset) return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    await deleteAsset(id);
    await auditAction(c, "marketing.asset.delete", "marketing-asset", id, { name: asset.name });
    return c.json({ success: true });
  }
);

/** 月次の台帳・実権限照合を記録する */
marketingAssetRoutes.post(
  "/:id/verify",
  requireMarketingPermission(MarketingPermission.Operate),
  withErrorHandler("MARKETING_ASSET_VERIFY_FAILED", "Failed to verify asset"),
  async (c) => {
    const asset = await markAssetVerified(c.req.param("id"), c.get("user").id);
    if (!asset) return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    await auditAction(c, "marketing.asset.verify", "marketing-asset", asset.id);
    const names = await getUserNameMap(assetUserIds(asset));
    return c.json(toAssetDto(asset, names));
  }
);

marketingAssetRoutes.post(
  "/:id/access",
  requireMarketingPermission(MarketingPermission.Operate),
  zValidator("json", createAssetAccessSchema),
  withErrorHandler("MARKETING_ACCESS_CREATE_FAILED", "Failed to record access"),
  async (c) => {
    const asset = await getAssetById(c.req.param("id"));
    if (!asset) return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    const input = c.req.valid("json");
    // External parties must have an end date (外部委託先は終了日を記録).
    if (
      input.principalType !== "employee" &&
      input.principalType !== "service" &&
      !input.expiresAt
    ) {
      return jsonError(
        c,
        400,
        "MARKETING_EXPIRY_REQUIRED",
        "An expiry date is required for agency and contractor access"
      );
    }
    const entry = await createAccessEntry({
      assetId: asset.id,
      principal: input.principal,
      principalType: input.principalType,
      role: input.role,
      scope: input.scope ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      approvedByUserId: c.get("user").id,
    });
    await auditAction(c, "marketing.asset.access.grant", "marketing-asset", asset.id, {
      principal: entry.principal,
      role: entry.role,
      expiresAt: entry.expiresAt?.toISOString() ?? null,
    });
    const names = await getUserNameMap([entry.approvedByUserId]);
    return c.json(toAssetAccessDto(entry, names), 201);
  }
);

marketingAssetRoutes.delete(
  "/:id/access/:accessId",
  requireMarketingPermission(MarketingPermission.Operate),
  withErrorHandler("MARKETING_ACCESS_REVOKE_FAILED", "Failed to revoke access"),
  async (c) => {
    const entry = await revokeAccessEntry(c.req.param("id"), c.req.param("accessId"));
    if (!entry) return jsonError(c, 404, "NOT_FOUND", "Access entry not found");
    await auditAction(c, "marketing.asset.access.revoke", "marketing-asset", entry.assetId, {
      principal: entry.principal,
      role: entry.role,
    });
    const names = await getUserNameMap([entry.approvedByUserId]);
    return c.json(toAssetAccessDto(entry, names));
  }
);
