import {
  ALL_MARKETING_PERMISSIONS,
  MarketingPermission,
  UserRole,
} from "@echolore/shared/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { jsonError } from "../lib/api-error.js";
import { extractRequestMeta, writeAuditLog } from "../lib/audit.js";
import type { AppEnv, SessionUser } from "../lib/auth.js";
import {
  getGroupPermissionsByIds,
  listMembershipsByUser,
} from "../repositories/admin/admin-repository.js";

/**
 * Marketing permissions are granted through user groups (≈ GitHub Teams in
 * the implementation plan). Higher permissions imply lower ones:
 *   manage  ⊇ operate ⊇ view
 *   review  ⊇ view
 * Review is intentionally not implied by manage so that authors and
 * approvers stay separate unless explicitly granted. Admins hold everything.
 */
const IMPLIED: Record<MarketingPermission, MarketingPermission[]> = {
  [MarketingPermission.View]: [],
  [MarketingPermission.Operate]: [MarketingPermission.View],
  [MarketingPermission.Review]: [MarketingPermission.View],
  [MarketingPermission.Manage]: [MarketingPermission.Operate, MarketingPermission.View],
};

const MARKETING_PERMISSION_SET = new Set<string>(ALL_MARKETING_PERMISSIONS);

export function expandMarketingPermissions(granted: string[]): MarketingPermission[] {
  const result = new Set<MarketingPermission>();
  for (const perm of granted) {
    if (!MARKETING_PERMISSION_SET.has(perm)) continue;
    const p = perm as MarketingPermission;
    result.add(p);
    for (const implied of IMPLIED[p]) result.add(implied);
  }
  return ALL_MARKETING_PERMISSIONS.filter((p) => result.has(p));
}

export async function resolveMarketingPermissions(
  user: SessionUser
): Promise<MarketingPermission[]> {
  if (user.role === UserRole.Admin) return [...ALL_MARKETING_PERMISSIONS];
  const memberships = await listMembershipsByUser(user.id);
  if (memberships.length === 0) return [];
  const groups = await getGroupPermissionsByIds(memberships.map((m) => m.groupId));
  const granted = groups.flatMap((g) => (Array.isArray(g.permissions) ? g.permissions : []));
  return expandMarketingPermissions(granted);
}

// Per-request memo so several checks in one request hit the DB once.
const requestCache = new WeakMap<Request, Promise<MarketingPermission[]>>();

export function getRequestMarketingPermissions(c: Context<AppEnv>): Promise<MarketingPermission[]> {
  const key = c.req.raw;
  let cached = requestCache.get(key);
  if (!cached) {
    cached = resolveMarketingPermissions(c.get("user"));
    requestCache.set(key, cached);
  }
  return cached;
}

export async function hasMarketingPermission(
  c: Context<AppEnv>,
  permission: MarketingPermission
): Promise<boolean> {
  return (await getRequestMarketingPermissions(c)).includes(permission);
}

export function requireMarketingPermission(
  permission: MarketingPermission
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
    if (!(await hasMarketingPermission(c, permission))) {
      await writeAuditLog({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "authz.denied",
        resourceType: "marketing",
        resourceId: c.req.path,
        metadata: { requiredPermission: permission, method: c.req.method },
        ...extractRequestMeta(c),
      });
      return jsonError(c, 403, "MARKETING_FORBIDDEN", "Insufficient marketing permission");
    }
    await next();
  };
}

/**
 * Separation of duties: the person who authored a change must not be the
 * one approving it (作成者と承認者を分ける / 自分の変更を単独承認しない).
 */
export function isSelfApproval(actorUserId: string, authorUserIds: Array<string | null>) {
  return authorUserIds.some((id) => id !== null && id === actorUserId);
}
