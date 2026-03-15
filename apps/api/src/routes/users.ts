import { UserRole } from "@corp-internal/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { jsonError, withErrorHandler } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import { listAuthSessionsForUser, revokeAuthSessionById } from "../lib/local-auth.js";
import { parsePaginationParams } from "../lib/pagination.js";
import { authorizeAdminResource, authorizeUserResource } from "../policies/authorization-policy.js";
import {
  createUser,
  deleteUser,
  getUserByEmail,
  getUserById,
  listUsers,
  updateUser,
} from "../repositories/user/user-repository.js";

export const usersRoutes = new Hono<AppEnv>();

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

const revokeSessionSchema = z.object({
  id: z.string().min(1),
});

// GET /api/users - List all users
usersRoutes.get("/", async (c) => {
  const authz = await authorizeAdminResource(c, "/users", "read");
  if (!authz.allowed) {
    return jsonError(c, 403, "FORBIDDEN", "Forbidden");
  }

  return withErrorHandler(
    async (c) => {
      const { limit, offset } = parsePaginationParams(c);
      const allUsers = await listUsers();
      return c.json({ users: allUsers.slice(offset, offset + limit), total: allUsers.length });
    },
    "USERS_LIST_FAILED",
    "Failed to fetch users"
  )(c);
});

// GET /api/users/me - Get current session user profile
usersRoutes.get(
  "/me",
  withErrorHandler(
    async (c) => {
      const sessionUser = c.get("user");

      const user = await getUserById(sessionUser.id);

      if (!user) {
        return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
      }

      return c.json({ user });
    },
    "CURRENT_USER_FETCH_FAILED",
    "Failed to fetch current user"
  )
);

// PUT /api/users/me - Update current session user profile
usersRoutes.put(
  "/me",
  zValidator("json", updateUserSchema),
  withErrorHandler(
    async (c) => {
      const sessionUser = c.get("user");
      const data = c.req.valid("json");

      const updatedUser = await updateUser(sessionUser.id, {
        ...data,
        updatedAt: new Date(),
      });

      if (!updatedUser) {
        return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
      }

      return c.json({ user: updatedUser });
    },
    "CURRENT_USER_UPDATE_FAILED",
    "Failed to update current user"
  )
);

usersRoutes.get(
  "/me/sessions",
  withErrorHandler(
    async (c) => {
      const sessionUser = c.get("user");

      const sessions = await listAuthSessionsForUser({
        userId: sessionUser.id,
      });
      return c.json({
        sessions: sessions.map((session) => ({
          id: session.id,
          clientType: session.clientType,
          authMode: session.authMode,
          deviceName: session.deviceName,
          createdAt: session.createdAt.toISOString(),
          lastSeenAt: session.lastSeenAt?.toISOString() ?? null,
          expiresAt: session.expiresAt.toISOString(),
          current: session.current,
        })),
      });
    },
    "AUTH_SESSIONS_FETCH_FAILED",
    "Failed to fetch auth sessions"
  )
);

usersRoutes.delete(
  "/me/sessions/:id",
  zValidator("param", revokeSessionSchema),
  withErrorHandler(
    async (c) => {
      const sessionUser = c.get("user");
      const { id } = c.req.valid("param");

      const revoked = await revokeAuthSessionById({
        userId: sessionUser.id,
        sessionId: id,
      });

      if (!revoked) {
        return jsonError(c, 404, "AUTH_SESSION_NOT_FOUND", "Session not found");
      }

      return c.json({ success: true });
    },
    "AUTH_SESSION_REVOKE_FAILED",
    "Failed to revoke auth session"
  )
);

// GET /api/users/:id - Get user by ID
usersRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();
  const authz = await authorizeUserResource(c, id, "read");
  if (!authz.allowed) {
    return jsonError(c, 403, "FORBIDDEN", "Forbidden");
  }

  return withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const user = await getUserById(id);

      if (!user) {
        return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
      }

      return c.json({ user });
    },
    "USER_FETCH_FAILED",
    "Failed to fetch user"
  )(c);
});

// GET /api/users/email/:email - Get user by email
usersRoutes.get("/email/:email", async (c) => {
  const { email } = c.req.param();
  const sessionUser = c.get("user");
  const normalizedEmail = decodeURIComponent(email).toLowerCase();
  const authz =
    sessionUser.email.toLowerCase() === normalizedEmail
      ? { allowed: true }
      : await authorizeAdminResource(c, `/users/email/${normalizedEmail}`, "read");

  if (!authz.allowed) {
    return jsonError(c, 403, "FORBIDDEN", "Forbidden");
  }

  return withErrorHandler(
    async (c) => {
      const { email } = c.req.param();
      const normalizedEmail = decodeURIComponent(email).toLowerCase();
      const user = await getUserByEmail(normalizedEmail);

      if (!user) {
        return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
      }

      return c.json({ user });
    },
    "USER_FETCH_FAILED",
    "Failed to fetch user"
  )(c);
});

// POST /api/users - Create user
usersRoutes.post("/", zValidator("json", createUserSchema), async (c) => {
  const authz = await authorizeAdminResource(c, "/users", "write");
  if (!authz.allowed) {
    return jsonError(c, 403, "FORBIDDEN", "Forbidden");
  }

  return withErrorHandler(
    async (c) => {
      const data = c.req.valid("json");
      const now = new Date();

      const newUser = await createUser({
        id: data.id,
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl || null,
        role: UserRole.Member,
        createdAt: now,
        updatedAt: now,
      });

      return c.json({ user: newUser }, 201);
    },
    "USER_CREATE_FAILED",
    "Failed to create user"
  )(c);
});

// PUT /api/users/:id - Update user
usersRoutes.put("/:id", zValidator("json", updateUserSchema), async (c) => {
  const { id } = c.req.param();
  const authz = await authorizeUserResource(c, id, "write");
  if (!authz.allowed) {
    return jsonError(c, 403, "FORBIDDEN", "Forbidden");
  }

  return withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const data = c.req.valid("json");
      const updatedUser = await updateUser(id, {
        ...data,
        updatedAt: new Date(),
      });

      if (!updatedUser) {
        return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
      }

      return c.json({ user: updatedUser });
    },
    "USER_UPDATE_FAILED",
    "Failed to update user"
  )(c);
});

// DELETE /api/users/:id - Delete user
usersRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const authz = await authorizeUserResource(c, id, "delete");
  if (!authz.allowed) {
    return jsonError(c, 403, "FORBIDDEN", "Forbidden");
  }

  return withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const deletedUser = await deleteUser(id);

      if (!deletedUser) {
        return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
      }

      return c.json({ success: true });
    },
    "USER_DELETE_FAILED",
    "Failed to delete user"
  )(c);
});
