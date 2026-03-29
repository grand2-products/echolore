import { UserRole } from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { jsonError, tryCatchResponse, withErrorHandler } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import { buildStoragePath, loadFile, removeFile, saveFile } from "../lib/file-storage.js";
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
} from "../services/admin/user-service.js";
import { resolveUserAvatarUrl } from "./user-dto.js";

export const usersRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a DB user row to a response DTO, resolving the avatar storage path. */
function toUserResponse(user: { id: string; avatar_url: string | null; [key: string]: unknown }) {
  return { ...user, avatarUrl: resolveUserAvatarUrl(user) };
}

/** Derive the MIME type from a storage path extension. */
function mimeFromPath(storagePath: string): string {
  const ext = storagePath.split(".").pop();
  switch (ext) {
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    default:
      return "image/webp";
  }
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  avatarUrl: z.string().optional(),
});

// avatarUrl is intentionally excluded — use POST/DELETE /me/avatar instead.
const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
});

const revokeSessionSchema = z.object({
  id: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Avatar constants
// ---------------------------------------------------------------------------

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const AVATAR_ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Remove any existing avatar files for the given user from storage. */
async function removeAvatarFiles(userId: string) {
  const basePath = buildStoragePath(`avatars/${userId}`);
  for (const ext of ["png", "jpg", "gif", "webp"]) {
    try {
      await removeFile(`${basePath}.${ext}`);
    } catch {
      // File may not exist with this extension
    }
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/users - List all users (admin)
usersRoutes.get("/", async (c) => {
  const authz = await authorizeAdminResource(c, "/users", "read");
  if (!authz.allowed) {
    return jsonError(c, 403, "FORBIDDEN", "Forbidden");
  }

  return tryCatchResponse(
    c,
    async () => {
      const { limit, offset } = parsePaginationParams(c);
      const allUsers = await listUsers();
      return c.json({
        users: allUsers.slice(offset, offset + limit).map(toUserResponse),
        total: allUsers.length,
      });
    },
    "USERS_LIST_FAILED",
    "Failed to fetch users"
  );
});

// GET /api/users/me - Current session user profile
usersRoutes.get(
  "/me",
  withErrorHandler("CURRENT_USER_FETCH_FAILED", "Failed to fetch current user"),
  async (c) => {
    const sessionUser = c.get("user");
    const user = await getUserById(sessionUser.id);

    if (!user) {
      return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
    }

    return c.json({ user: toUserResponse(user) });
  }
);

// PUT /api/users/me - Update current session user profile
usersRoutes.put(
  "/me",
  zValidator("json", updateUserSchema),
  withErrorHandler("CURRENT_USER_UPDATE_FAILED", "Failed to update current user"),
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

    return c.json({ user: toUserResponse(updatedUser) });
  }
);

// POST /api/users/me/avatar - Upload avatar
usersRoutes.post(
  "/me/avatar",
  withErrorHandler("AVATAR_UPLOAD_FAILED", "Failed to upload avatar"),
  async (c) => {
    const sessionUser = c.get("user");

    const contentType = c.req.header("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonError(c, 400, "AVATAR_MULTIPART_REQUIRED", "Multipart form data required");
    }

    const body = await c.req.parseBody();
    const uploadedFile = body.file as File | undefined;
    if (!uploadedFile) {
      return jsonError(c, 400, "AVATAR_FILE_MISSING", "No file provided");
    }

    if (!AVATAR_ALLOWED_TYPES.has(uploadedFile.type)) {
      return jsonError(
        c,
        400,
        "AVATAR_INVALID_TYPE",
        "Only PNG, JPEG, GIF, and WebP images are allowed"
      );
    }

    if (uploadedFile.size > AVATAR_MAX_BYTES) {
      return jsonError(c, 400, "AVATAR_TOO_LARGE", "Avatar must be 2 MB or smaller");
    }

    // Remove old avatar file(s) before writing the new one
    await removeAvatarFiles(sessionUser.id);

    const buffer = Buffer.from(await uploadedFile.arrayBuffer());
    const ext =
      uploadedFile.type.split("/")[1] === "jpeg" ? "jpg" : uploadedFile.type.split("/")[1];
    const storagePath = buildStoragePath(`avatars/${sessionUser.id}.${ext}`);

    await saveFile(storagePath, buffer, uploadedFile.type);

    // Store the storage path in DB — resolveUserAvatarUrl converts it to the
    // serving URL (/api/users/{id}/avatar) in API responses.
    const updatedUser = await updateUser(sessionUser.id, {
      avatarUrl: storagePath,
      updatedAt: new Date(),
    });

    if (!updatedUser) {
      return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
    }

    return c.json({ user: toUserResponse(updatedUser) });
  }
);

// DELETE /api/users/me/avatar - Remove avatar
usersRoutes.delete(
  "/me/avatar",
  withErrorHandler("AVATAR_DELETE_FAILED", "Failed to delete avatar"),
  async (c) => {
    const sessionUser = c.get("user");

    const currentUser = await getUserById(sessionUser.id);
    if (!currentUser) {
      return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
    }

    // If the stored value is a storage path, remove the file
    if (currentUser.avatar_url?.startsWith("avatars/")) {
      try {
        await removeFile(currentUser.avatar_url);
      } catch {
        // File may already be gone
      }
    }

    const updatedUser = await updateUser(sessionUser.id, {
      avatarUrl: null,
      updatedAt: new Date(),
    });

    if (!updatedUser) {
      return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
    }
    return c.json({ user: toUserResponse(updatedUser) });
  }
);

// GET /api/users/me/sessions
usersRoutes.get(
  "/me/sessions",
  withErrorHandler("AUTH_SESSIONS_FETCH_FAILED", "Failed to fetch auth sessions"),
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
  }
);

// DELETE /api/users/me/sessions/:id
usersRoutes.delete(
  "/me/sessions/:id",
  zValidator("param", revokeSessionSchema),
  withErrorHandler("AUTH_SESSION_REVOKE_FAILED", "Failed to revoke auth session"),
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
  }
);

// GET /api/users/:id/avatar - Serve avatar image
usersRoutes.get(
  "/:id/avatar",
  withErrorHandler("AVATAR_FETCH_FAILED", "Failed to fetch avatar"),
  async (c) => {
    const { id } = c.req.param();
    const targetUser = await getUserById(id);

    // Only serve if the stored value is a storage path (not an external URL)
    if (!targetUser?.avatar_url?.startsWith("avatars/")) {
      return jsonError(c, 404, "AVATAR_NOT_FOUND", "No avatar set");
    }

    const buffer = await loadFile(targetUser.avatar_url);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeFromPath(targetUser.avatar_url),
        "Cache-Control": "private, max-age=3600",
      },
    });
  }
);

// GET /api/users/:id - Get user by ID
usersRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();
  const authz = await authorizeUserResource(c, id, "read");
  if (!authz.allowed) {
    return jsonError(c, 403, "FORBIDDEN", "Forbidden");
  }

  return tryCatchResponse(
    c,
    async () => {
      const { id } = c.req.param();
      const user = await getUserById(id);

      if (!user) {
        return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
      }

      return c.json({ user: toUserResponse(user) });
    },
    "USER_FETCH_FAILED",
    "Failed to fetch user"
  );
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

  return tryCatchResponse(
    c,
    async () => {
      const { email } = c.req.param();
      const normalizedEmail = decodeURIComponent(email).toLowerCase();
      const user = await getUserByEmail(normalizedEmail);

      if (!user) {
        return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
      }

      return c.json({ user: toUserResponse(user) });
    },
    "USER_FETCH_FAILED",
    "Failed to fetch user"
  );
});

// POST /api/users - Create user (admin)
usersRoutes.post("/", zValidator("json", createUserSchema), async (c) => {
  const authz = await authorizeAdminResource(c, "/users", "write");
  if (!authz.allowed) {
    return jsonError(c, 403, "FORBIDDEN", "Forbidden");
  }

  return tryCatchResponse(
    c,
    async () => {
      const data = c.req.valid("json");
      const now = new Date();

      const newUser = await createUser({
        id: `user_${crypto.randomUUID()}`,
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl || null,
        role: UserRole.Member,
        createdAt: now,
        updatedAt: now,
      });

      if (!newUser) {
        return jsonError(c, 500, "USER_CREATE_FAILED", "Failed to create user");
      }

      return c.json({ user: toUserResponse(newUser) }, 201);
    },
    "USER_CREATE_FAILED",
    "Failed to create user"
  );
});

// PUT /api/users/:id - Update user
usersRoutes.put("/:id", zValidator("json", updateUserSchema), async (c) => {
  const { id } = c.req.param();
  const authz = await authorizeUserResource(c, id, "write");
  if (!authz.allowed) {
    return jsonError(c, 403, "FORBIDDEN", "Forbidden");
  }

  return tryCatchResponse(
    c,
    async () => {
      const { id } = c.req.param();
      const data = c.req.valid("json");
      const updatedUser = await updateUser(id, {
        ...data,
        updatedAt: new Date(),
      });

      if (!updatedUser) {
        return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
      }

      return c.json({ user: toUserResponse(updatedUser) });
    },
    "USER_UPDATE_FAILED",
    "Failed to update user"
  );
});

// DELETE /api/users/:id - Delete user
usersRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const authz = await authorizeUserResource(c, id, "delete");
  if (!authz.allowed) {
    return jsonError(c, 403, "FORBIDDEN", "Forbidden");
  }

  return tryCatchResponse(
    c,
    async () => {
      const { id } = c.req.param();
      const deletedUser = await deleteUser(id);

      if (!deletedUser) {
        return jsonError(c, 404, "USER_NOT_FOUND", "User not found");
      }

      return c.json({ success: true });
    },
    "USER_DELETE_FAILED",
    "Failed to delete user"
  );
});
