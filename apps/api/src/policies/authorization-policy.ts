import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../db/index.js";
import { pageInheritance, pagePermissions, pages, userGroupMemberships } from "../db/schema.js";
import { writeAuditLog } from "../lib/audit.js";
import type { AppEnv, SessionUser } from "../lib/auth.js";

export type AuthorizationAction = "read" | "write" | "delete";
export type AuthorizationResourceType = "wiki-page" | "meeting" | "file" | "user" | "admin";

export type AuthorizationResult = {
  allowed: boolean;
  reason: string;
};

const getClientIp = (c: Context<AppEnv>) =>
  c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;

async function logAuthorizationDecision(
  c: Context<AppEnv>,
  user: SessionUser,
  resourceType: string,
  resourceId: string,
  action: AuthorizationAction,
  result: AuthorizationResult
) {
  await writeAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: result.allowed ? "authz.allowed" : "authz.denied",
    resourceType,
    resourceId,
    metadata: {
      requiredAction: action,
      reason: result.reason,
    },
    ipAddress: getClientIp(c),
    userAgent: c.req.header("user-agent") ?? null,
  });
}

function evaluateOwnerOrAdmin(user: SessionUser, ownerUserId: string): AuthorizationResult {
  if (user.role === "admin") return { allowed: true, reason: "admin" };
  if (ownerUserId === user.id) return { allowed: true, reason: "owner" };
  return { allowed: false, reason: "not-owner" };
}

function evaluateSelfOrAdmin(user: SessionUser, targetUserId: string): AuthorizationResult {
  if (user.role === "admin") return { allowed: true, reason: "admin" };
  if (user.id === targetUserId) return { allowed: true, reason: "self" };
  return { allowed: false, reason: "not-self" };
}

function evaluateAdminOnly(user: SessionUser): AuthorizationResult {
  if (user.role === "admin") return { allowed: true, reason: "admin" };
  return { allowed: false, reason: "admin-required" };
}

async function getEffectivePagePermissions(pageId: string, visited = new Set<string>()) {
  if (visited.has(pageId)) {
    return [];
  }
  visited.add(pageId);

  const [[inheritance], [page]] = await Promise.all([
    db.select().from(pageInheritance).where(eq(pageInheritance.pageId, pageId)),
    db.select({ parentId: pages.parentId }).from(pages).where(eq(pages.id, pageId)),
  ]);

  const shouldInherit = inheritance?.inheritFromParent ?? true;
  if (shouldInherit && page?.parentId) {
    return getEffectivePagePermissions(page.parentId, visited);
  }

  return db.select().from(pagePermissions).where(eq(pagePermissions.pageId, pageId));
}

async function evaluatePageAccess(
  user: SessionUser,
  pageId: string,
  ownerUserId: string,
  action: AuthorizationAction
): Promise<AuthorizationResult> {
  const ownerResult = evaluateOwnerOrAdmin(user, ownerUserId);
  if (ownerResult.allowed) {
    return ownerResult;
  }

  const [memberships, permissions] = await Promise.all([
    db
      .select({ groupId: userGroupMemberships.groupId })
      .from(userGroupMemberships)
      .where(eq(userGroupMemberships.userId, user.id)),
    getEffectivePagePermissions(pageId),
  ]);

  const groupIds = new Set(memberships.map((membership) => membership.groupId));
  const matchedPermission = permissions.find((permission) => {
    if (!permission.groupId || !groupIds.has(permission.groupId)) return false;

    if (action === "read") return permission.canRead;
    if (action === "write") return permission.canWrite;
    return permission.canDelete;
  });

  if (matchedPermission?.groupId) {
    return { allowed: true, reason: `group:${matchedPermission.groupId}` };
  }

  return { allowed: false, reason: "missing-page-permission" };
}

export async function authorizeOwnerResource(
  c: Context<AppEnv>,
  resourceType: Exclude<AuthorizationResourceType, "user" | "admin">,
  resourceId: string,
  ownerUserId: string,
  action: AuthorizationAction
): Promise<AuthorizationResult> {
  const user = c.get("user");
  const result = evaluateOwnerOrAdmin(user, ownerUserId);
  await logAuthorizationDecision(c, user, resourceType, resourceId, action, result);
  return result;
}

export async function authorizePageResource(
  c: Context<AppEnv>,
  pageId: string,
  ownerUserId: string,
  action: AuthorizationAction
): Promise<AuthorizationResult> {
  const user = c.get("user");
  const result = await evaluatePageAccess(user, pageId, ownerUserId, action);
  await logAuthorizationDecision(c, user, "wiki-page", pageId, action, result);
  return result;
}

export async function canReadPage(
  user: SessionUser,
  pageId: string,
  ownerUserId: string
): Promise<boolean> {
  const result = await evaluatePageAccess(user, pageId, ownerUserId, "read");
  return result.allowed;
}

export async function authorizeUserResource(
  c: Context<AppEnv>,
  targetUserId: string,
  action: AuthorizationAction
): Promise<AuthorizationResult> {
  const user = c.get("user");
  const result =
    action === "delete" ? evaluateAdminOnly(user) : evaluateSelfOrAdmin(user, targetUserId);
  await logAuthorizationDecision(c, user, "user", targetUserId, action, result);
  return result;
}

export async function authorizeAdminResource(
  c: Context<AppEnv>,
  resourceId: string,
  action: AuthorizationAction
): Promise<AuthorizationResult> {
  const user = c.get("user");
  const result = evaluateAdminOnly(user);
  await logAuthorizationDecision(c, user, "admin", resourceId, action, result);
  return result;
}
