import { db } from "../../db/index.js";

export interface MemberGrantRow {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
}

/** Active users with their group permissions flattened. */
export async function listActiveUsersWithGroupPermissions(): Promise<MemberGrantRow[]> {
  const [users, memberships, groups] = await Promise.all([
    db
      .selectFrom("users")
      .select(["id", "name", "email", "role"])
      .where("deletedAt", "is", null)
      .where("suspendedAt", "is", null)
      .execute(),
    db.selectFrom("user_group_memberships").select(["userId", "groupId"]).execute(),
    db.selectFrom("user_groups").select(["id", "permissions"]).execute(),
  ]);
  const groupPerms = new Map(
    groups.map((g) => [g.id, Array.isArray(g.permissions) ? g.permissions : []])
  );
  const perUser = new Map<string, string[]>();
  for (const m of memberships) {
    const list = perUser.get(m.userId) ?? [];
    list.push(...(groupPerms.get(m.groupId) ?? []));
    perUser.set(m.userId, list);
  }
  return users.map((u) => ({ ...u, permissions: perUser.get(u.id) ?? [] }));
}
