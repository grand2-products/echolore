import { sql } from "kysely";
import { db } from "../../db/index.js";
import { getRecordById } from "../../lib/db-utils.js";

export async function getUserCount() {
  const row = await db
    .selectFrom("users")
    .select(sql<number>`count(*)::int`.as("value"))
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  return row?.value ?? 0;
}

export async function listUsers() {
  return db.selectFrom("users").selectAll().execute();
}

export async function getUserById(id: string) {
  return getRecordById("users", id);
}

export async function getUserByEmail(email: string) {
  return (
    (await db.selectFrom("users").selectAll().where("email", "=", email).executeTakeFirst()) ?? null
  );
}

export async function createUser(input: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return (
    (await db
      .insertInto("users")
      .values({
        id: input.id,
        email: input.email,
        name: input.name,
        avatar_url: input.avatarUrl,
        role: input.role,
        created_at: input.createdAt,
        updated_at: input.updatedAt,
      })
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function updateUser(
  id: string,
  input: {
    name?: string;
    avatarUrl?: string | null;
    updatedAt: Date;
  }
) {
  return (
    (await db
      .updateTable("users")
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}),
        updated_at: input.updatedAt,
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function deleteUser(id: string) {
  return (
    (await db.deleteFrom("users").where("id", "=", id).returningAll().executeTakeFirst()) ?? null
  );
}

export async function suspendUser(id: string) {
  const now = new Date();
  return (
    (await db
      .updateTable("users")
      .set({
        suspended_at: now,
        token_version: sql`token_version + 1`,
        updated_at: now,
      })
      .where("id", "=", id)
      .where("suspended_at", "is", null)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function unsuspendUser(id: string) {
  return (
    (await db
      .updateTable("users")
      .set({ suspended_at: null, updated_at: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function softDeleteUser(id: string) {
  const now = new Date();
  return (
    (await db
      .updateTable("users")
      .set({
        deleted_at: now,
        token_version: sql`token_version + 1`,
        updated_at: now,
      })
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function restoreUser(id: string) {
  return (
    (await db
      .updateTable("users")
      .set({ deleted_at: null, suspended_at: null, updated_at: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}
