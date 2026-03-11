import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";

export async function listUsers() {
  return db.select().from(users);
}

export async function getUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user ?? null;
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
  const [user] = await db.insert(users).values(input).returning();
  return user ?? null;
}

export async function updateUser(
  id: string,
  input: {
    name?: string;
    avatarUrl?: string;
    updatedAt: Date;
  }
) {
  const [user] = await db.update(users).set(input).where(eq(users.id, id)).returning();
  return user ?? null;
}

export async function deleteUser(id: string) {
  const [user] = await db.delete(users).where(eq(users.id, id)).returning();
  return user ?? null;
}
