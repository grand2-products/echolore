import { updateUserRole } from "../../repositories/admin/admin-repository.js";

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
