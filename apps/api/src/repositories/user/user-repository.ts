import { sql } from "kysely";
import { db } from "../../db/index.js";
import type { User } from "../../db/schema.js";

export async function getUserCount(): Promise<number> {
  const row = await db
    .selectFrom("users")
    .select(sql<number>`count(*)::int`.as("value"))
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  return row?.value ?? 0;
}

export async function listUsers(): Promise<User[]> {
  return db.selectFrom("users").selectAll().execute();
}

export async function getUserById(id: string): Promise<User | null> {
  return (await db.selectFrom("users").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
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
}): Promise<User | null> {
  return (
    (await db
      .insertInto("users")
      .values({
        id: input.id,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
        role: input.role,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
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
): Promise<User | null> {
  return (
    (await db
      .updateTable("users")
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        updatedAt: input.updatedAt,
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function deleteUser(id: string): Promise<User | null> {
  return (
    (await db.deleteFrom("users").where("id", "=", id).returningAll().executeTakeFirst()) ?? null
  );
}

export async function suspendUser(id: string): Promise<User | null> {
  const now = new Date();
  return (
    (await db
      .updateTable("users")
      .set({
        suspendedAt: now,
        tokenVersion: sql`token_version + 1`,
        updatedAt: now,
      })
      .where("id", "=", id)
      .where("suspendedAt", "is", null)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function unsuspendUser(id: string): Promise<User | null> {
  return (
    (await db
      .updateTable("users")
      .set({ suspendedAt: null, updatedAt: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function softDeleteUser(id: string): Promise<User | null> {
  const now = new Date();
  return (
    (await db
      .updateTable("users")
      .set({
        deletedAt: now,
        tokenVersion: sql`token_version + 1`,
        updatedAt: now,
      })
      .where("id", "=", id)
      .where("deletedAt", "is", null)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function restoreUser(id: string): Promise<User | null> {
  return (
    (await db
      .updateTable("users")
      .set({ deletedAt: null, suspendedAt: null, updatedAt: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}
