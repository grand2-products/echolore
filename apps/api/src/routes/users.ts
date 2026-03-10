import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const usersRoutes = new Hono();

// Validation schemas
const createUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1),
  avatarUrl: z.string().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  avatarUrl: z.string().optional(),
});

// GET /api/users - List all users
usersRoutes.get("/", async (c) => {
  try {
    const allUsers = await db.select().from(users);
    return c.json({ users: allUsers });
  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json({ error: "Failed to fetch users" }, 500);
  }
});

// GET /api/users/:id - Get user by ID
usersRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ user });
  } catch (error) {
    console.error("Error fetching user:", error);
    return c.json({ error: "Failed to fetch user" }, 500);
  }
});

// GET /api/users/email/:email - Get user by email
usersRoutes.get("/email/:email", async (c) => {
  const { email } = c.req.param();

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, decodeURIComponent(email)));

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ user });
  } catch (error) {
    console.error("Error fetching user:", error);
    return c.json({ error: "Failed to fetch user" }, 500);
  }
});

// POST /api/users - Create user
usersRoutes.post("/", zValidator("json", createUserSchema), async (c) => {
  const data = c.req.valid("json");

  try {
    const now = new Date();

    const [newUser] = await db
      .insert(users)
      .values({
        id: data.id,
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl || null,
        role: "member",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return c.json({ user: newUser }, 201);
  } catch (error) {
    console.error("Error creating user:", error);
    return c.json({ error: "Failed to create user" }, 500);
  }
});

// PUT /api/users/:id - Update user
usersRoutes.put("/:id", zValidator("json", updateUserSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  try {
    const [updatedUser] = await db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    if (!updatedUser) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ user: updatedUser });
  } catch (error) {
    console.error("Error updating user:", error);
    return c.json({ error: "Failed to update user" }, 500);
  }
});

// DELETE /api/users/:id - Delete user
usersRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();

  try {
    const [deletedUser] = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning();

    if (!deletedUser) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return c.json({ error: "Failed to delete user" }, 500);
  }
});
