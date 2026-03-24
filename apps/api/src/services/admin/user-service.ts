import { invalidateVerifiedUser } from "../../lib/auth.js";
import { updateUserRole } from "../../repositories/admin/admin-repository.js";
import {
  restoreUser as repoRestoreUser,
  softDeleteUser as repoSoftDeleteUser,
  suspendUser as repoSuspendUser,
  unsuspendUser as repoUnsuspendUser,
} from "../../repositories/user/user-repository.js";

// Re-export repository CRUD for route layer access
export {
  createUser,
  deleteUser,
  getUserByEmail,
  getUserById,
  listUsers,
  updateUser,
} from "../../repositories/user/user-repository.js";

export async function changeUserRole(userId: string, role: string) {
  return updateUserRole(userId, role);
}

export async function suspendUser(userId: string) {
  const user = await repoSuspendUser(userId);
  if (user) invalidateVerifiedUser(userId);
  return user;
}

export async function unsuspendUser(userId: string) {
  return repoUnsuspendUser(userId);
}

export async function softDeleteUser(userId: string) {
  const user = await repoSoftDeleteUser(userId);
  if (user) invalidateVerifiedUser(userId);
  return user;
}

export async function restoreUser(userId: string) {
  return repoRestoreUser(userId);
}
