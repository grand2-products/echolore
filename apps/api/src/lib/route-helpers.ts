import { UserRole } from "@echolore/shared/contracts";
import type { Context } from "hono";
import { jsonError } from "./api-error.js";
import type { AppEnv } from "./auth.js";

/**
 * Asserts that an entity is non-null, returning it if found.
 * Throws an error (caught by `withErrorHandler`) when the entity is missing.
 *
 * @example
 * const meeting = findOrFail(await getMeetingById(id), c, "MEETING_NOT_FOUND", "Meeting not found");
 */
export function findOrFail<T>(
  entity: T | null | undefined,
  c: Context<AppEnv>,
  code: string,
  message: string
): T {
  if (entity == null) {
    // Throw a Response so the handler exits immediately.
    // withErrorHandler re-throws Response instances as-is (not converted to 500).
    throw jsonError(c, 404, code, message);
  }
  return entity;
}

/**
 * Returns `true` when the given user either owns the resource or has Admin
 * privileges.  Useful for inline authorization checks.
 */
export function isOwnerOrAdmin(user: { id: string; role: string }, ownerId: string): boolean {
  return user.id === ownerId || user.role === UserRole.Admin;
}

/**
 * Guard that throws a 403 JSON error response (caught by `withErrorHandler`)
 * when the current user is neither the resource owner nor an Admin.
 */
export function requireOwnerOrAdmin(
  c: Context<AppEnv>,
  ownerId: string,
  code = "FORBIDDEN",
  message = "Forbidden"
): void {
  const user = c.get("user");
  if (!isOwnerOrAdmin(user, ownerId)) {
    throw jsonError(c, 403, code, message);
  }
}
