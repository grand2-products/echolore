import { UserRole } from "@echolore/shared/contracts";
import type { Context } from "hono";
import { extractRequestMeta, writeAuditLog } from "../lib/audit.js";
import type { AppEnv, SessionUser } from "../lib/auth.js";
import {
  getGroupPermissionsByIds,
  getPageInheritance,
  listMembershipsByUser,
  listPagePermissions,
  listSpacePermissionsForSpace,
} from "../repositories/admin/admin-repository.js";
import { getPageParentId, getPageSpaceId } from "../repositories/wiki/wiki-repository.js";

export type AuthorizationAction = "read" | "write" | "delete";
export type AuthorizationResourceType = "wiki-page" | "meeting" | "file" | "user" | "admin";

export type AuthorizationResult = {
  allowed: boolean;
  reason: string;
};

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
    ...extractRequestMeta(c),
  });
}

function evaluateOwnerOrAdmin(user: SessionUser, ownerUserId: string): AuthorizationResult {
  if (user.role === UserRole.Admin) return { allowed: true, reason: "admin" };
  if (ownerUserId === user.id) return { allowed: true, reason: "owner" };
  return { allowed: false, reason: "not-owner" };
}

function evaluateSelfOrAdmin(user: SessionUser, targetUserId: string): AuthorizationResult {
  if (user.role === UserRole.Admin) return { allowed: true, reason: "admin" };
  if (user.id === targetUserId) return { allowed: true, reason: "self" };
  return { allowed: false, reason: "not-self" };
}

function evaluateAdminOnly(user: SessionUser): AuthorizationResult {
  if (user.role === UserRole.Admin) return { allowed: true, reason: "admin" };
  return { allowed: false, reason: "admin-required" };
}

const MAX_INHERITANCE_DEPTH = 20;

async function getEffectivePagePermissions(pageId: string, visited = new Set<string>()) {
  if (visited.has(pageId)) {
    console.warn(`[authz] Cycle detected in page inheritance at pageId=${pageId}`);
    return [];
  }
  if (visited.size >= MAX_INHERITANCE_DEPTH) {
    console.warn(
      `[authz] Max inheritance depth (${MAX_INHERITANCE_DEPTH}) reached at pageId=${pageId}`
    );
    return [];
  }
  visited.add(pageId);

  const [inheritance, parentId] = await Promise.all([
    getPageInheritance(pageId),
    getPageParentId(pageId),
  ]);

  const shouldInherit = inheritance?.inheritFromParent ?? true;
  if (shouldInherit && parentId) {
    return getEffectivePagePermissions(parentId, visited);
  }

  return listPagePermissions(pageId);
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

  const [memberships, permissions, spaceId] = await Promise.all([
    listMembershipsByUser(user.id),
    getEffectivePagePermissions(pageId),
    getPageSpaceId(pageId),
  ]);

  const groupIds = memberships.map((membership) => membership.groupId);
  const groupIdSet = new Set(groupIds);

  // Layer 2: Check page permissions
  const matchedPermission = permissions.find((permission) => {
    if (!permission.groupId || !groupIdSet.has(permission.groupId)) return false;

    if (action === "read") return permission.canRead;
    if (action === "write") return permission.canWrite;
    return permission.canDelete;
  });

  if (matchedPermission?.groupId) {
    return { allowed: true, reason: `group:${matchedPermission.groupId}` };
  }

  // If there are explicit page permissions for any of the user's groups, deny
  // (page permissions were set but didn't grant the requested action)
  const hasExplicitPagePermissions = permissions.some(
    (permission) => permission.groupId && groupIdSet.has(permission.groupId)
  );
  if (hasExplicitPagePermissions) {
    return { allowed: false, reason: "page-permission-denied" };
  }

  // Layer 3: Fallback to space permissions
  if (spaceId) {
    const spacePerms = await listSpacePermissionsForSpace(spaceId, groupIds);
    const matchedSpacePerm = spacePerms.find((sp) => {
      if (action === "read") return sp.canRead;
      if (action === "write") return sp.canWrite;
      return sp.canDelete;
    });

    if (matchedSpacePerm) {
      return { allowed: true, reason: `space-group:${matchedSpacePerm.groupId}` };
    }
  }

  return { allowed: false, reason: "missing-permission" };
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

export async function evaluatePageWriteAccess(
  user: SessionUser,
  pageId: string,
  ownerUserId: string
): Promise<AuthorizationResult> {
  return evaluatePageAccess(user, pageId, ownerUserId, "write");
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

export async function canApproveKnowledge(user: SessionUser): Promise<boolean> {
  if (user.role === UserRole.Admin) return true;

  const memberships = await listMembershipsByUser(user.id);
  if (memberships.length === 0) return false;

  const groupIds = memberships.map((m) => m.groupId);
  const groups = await getGroupPermissionsByIds(groupIds);

  return groups.some(
    (g) => Array.isArray(g.permissions) && g.permissions.includes("knowledge.approve")
  );
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
