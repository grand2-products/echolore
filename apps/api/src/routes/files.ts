import { UserRole } from "@corp-internal/shared/contracts";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import { buildStoragePath, loadFile, removeFile, saveFile } from "../lib/file-storage.js";
import { authorizeOwnerResource } from "../policies/authorization-policy.js";
import {
  createFile,
  deleteFile,
  getFileById,
  listFiles,
  listFilesByUploader,
} from "../repositories/file/file-repository.js";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const filesRoutes = new Hono<AppEnv>();

// GET /api/files - List all files
filesRoutes.get(
  "/",
  withErrorHandler(
    async (c) => {
      const user = c.get("user");

      const allFiles =
        user.role === UserRole.Admin ? await listFiles() : await listFilesByUploader(user.id);
      return c.json({ files: allFiles });
    },
    "FILES_LIST_FAILED",
    "Failed to fetch files"
  )
);

// GET /api/files/:id - Get file metadata
filesRoutes.get(
  "/:id",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();

      const file = await getFileById(id);

      if (!file) {
        return jsonError(c, 404, "FILE_NOT_FOUND", "File not found");
      }

      const authz = await authorizeOwnerResource(c, "file", id, file.uploaderId, "read");
      if (!authz.allowed) {
        return jsonError(c, 403, "FORBIDDEN", "Forbidden");
      }

      return c.json({ file });
    },
    "FILE_FETCH_FAILED",
    "Failed to fetch file"
  )
);

// POST /api/files/upload - Upload file
filesRoutes.post(
  "/upload",
  withErrorHandler(
    async (c) => {
      const user = c.get("user");
      if (!user?.id) {
        return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
      }

      const contentType = c.req.header("content-type") || "";

      if (!contentType.includes("multipart/form-data")) {
        return jsonError(c, 400, "FILE_MULTIPART_REQUIRED", "Multipart form data required");
      }

      const contentLength = Number(c.req.header("content-length") || "0");
      if (contentLength > MAX_FILE_SIZE_BYTES) {
        return jsonError(
          c,
          413,
          "FILE_TOO_LARGE",
          `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`
        );
      }

      const body = await c.req.parseBody();
      const uploadedFile = body.file as File;

      if (!uploadedFile) {
        return jsonError(c, 400, "FILE_REQUIRED", "File is required");
      }

      if (uploadedFile.size > MAX_FILE_SIZE_BYTES) {
        return jsonError(
          c,
          413,
          "FILE_TOO_LARGE",
          `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`
        );
      }

      const fileId = crypto.randomUUID();
      // Sanitize original filename: strip path separators and control characters
      const safeName =
        uploadedFile.name
          .replace(/[/\\]/g, "_")
          .replace(/[^\x20-\x7e\x80-\uffff]/g, "")
          .replace(/\.{2,}/g, ".") || "file";
      const filename = `${fileId}-${safeName}`;
      const storagePath = buildStoragePath(`uploads/${filename}`);

      const arrayBuffer = await uploadedFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await saveFile(storagePath, buffer);

      const newFile = await createFile({
        id: fileId,
        filename: uploadedFile.name,
        contentType: uploadedFile.type,
        size: uploadedFile.size,
        storagePath,
        uploaderId: user.id,
        createdAt: new Date(),
      });

      return c.json({ file: newFile }, 201);
    },
    "FILE_UPLOAD_FAILED",
    "Failed to upload file"
  )
);

// GET /api/files/:id/download - Download file
filesRoutes.get(
  "/:id/download",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();

      const fileRecord = await getFileById(id);

      if (!fileRecord) {
        return jsonError(c, 404, "FILE_NOT_FOUND", "File not found");
      }

      const authz = await authorizeOwnerResource(c, "file", id, fileRecord.uploaderId, "read");
      if (!authz.allowed) {
        return jsonError(c, 403, "FORBIDDEN", "Forbidden");
      }

      const buffer = await loadFile(fileRecord.storagePath);

      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": fileRecord.contentType || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(fileRecord.filename)}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    },
    "FILE_DOWNLOAD_FAILED",
    "Failed to download file"
  )
);

// DELETE /api/files/:id - Delete file
filesRoutes.delete(
  "/:id",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();

      const fileRecord = await getFileById(id);

      if (!fileRecord) {
        return jsonError(c, 404, "FILE_NOT_FOUND", "File not found");
      }

      const authz = await authorizeOwnerResource(c, "file", id, fileRecord.uploaderId, "delete");
      if (!authz.allowed) {
        return jsonError(c, 403, "FORBIDDEN", "Forbidden");
      }

      await removeFile(fileRecord.storagePath);

      await deleteFile(id);

      return c.json({ success: true });
    },
    "FILE_DELETE_FAILED",
    "Failed to delete file"
  )
);
