import { updateUserRole } from "../../repositories/admin/admin-repository.js";

export async function changeUserRole(userId: string, role: string) {
  return updateUserRole(userId, role);
}
