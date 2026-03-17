import { count, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { firstOrNull, getRecordById } from "../../lib/db-utils.js";

export async function getUserCount() {
  const [row] = await db.select({ value: count() }).from(users);
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
    avatarUrl?: string;
    updatedAt: Date;
  }
) {
  return firstOrNull(await db.update(users).set(input).where(eq(users.id, id)).returning());
}

export async function deleteUser(id: string) {
  return firstOrNull(await db.delete(users).where(eq(users.id, id)).returning());
}
