import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { firstOrNull, getRecordById } from "../../lib/db-utils.js";

export async function getUserCount() {
  const [row] = await db.select({ value: count() }).from(users).where(isNull(users.deletedAt));
  return row?.value ?? 0;
}

export async function listUsers() {
  return db.select().from(users);
}

export async function getUserById(id: string) {
  return getRecordById(users, id);
}

export async function getUserByEmail(email: string) {
  return firstOrNull(await db.select().from(users).where(eq(users.email, email)));
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
  return firstOrNull(await db.insert(users).values(input).returning());
}

export async function updateUser(
  id: string,
  input: {
    name?: string;
    avatarUrl?: string | null;
    updatedAt: Date;
  }
) {
  return firstOrNull(await db.update(users).set(input).where(eq(users.id, id)).returning());
}

export async function deleteUser(id: string) {
  return firstOrNull(await db.delete(users).where(eq(users.id, id)).returning());
}

export async function suspendUser(id: string) {
  const now = new Date();
  return firstOrNull(
    await db
      .update(users)
      .set({
        suspendedAt: now,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: now,
      })
      .where(and(eq(users.id, id), isNull(users.suspendedAt)))
      .returning()
  );
}

export async function unsuspendUser(id: string) {
  return firstOrNull(
    await db
      .update(users)
      .set({ suspendedAt: null, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
  );
}

export async function softDeleteUser(id: string) {
  const now = new Date();
  return firstOrNull(
    await db
      .update(users)
      .set({
        deletedAt: now,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: now,
      })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning()
  );
}

export async function restoreUser(id: string) {
  return firstOrNull(
    await db
      .update(users)
      .set({ deletedAt: null, suspendedAt: null, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
  );
}
