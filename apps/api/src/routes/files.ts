import { Storage } from "@google-cloud/storage";
import { Hono } from "hono";
import type { AppEnv } from "../lib/auth.js";
import { jsonError } from "../lib/api-error.js";
import { authorizeOwnerResource } from "../policies/authorization-policy.js";
import {
  createFile,
  deleteFile,
  getFileById,
  listFiles,
  listFilesByUploader,
} from "../repositories/file/file-repository.js";

export const filesRoutes = new Hono<AppEnv>();

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET || "corp-internal-files-dev";
const bucket = storage.bucket(bucketName);

// GET /api/files - List all files
filesRoutes.get("/", async (c) => {
  const user = c.get("user");

  try {
    const allFiles = user.role === "admin" ? await listFiles() : await listFilesByUploader(user.id);
    return c.json({ files: allFiles });
  } catch (error) {
    console.error("Error fetching files:", error);
    return jsonError(c, 500, "FILES_LIST_FAILED", "Failed to fetch files");
  }
});

// GET /api/files/:id - Get file metadata
filesRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();

  try {
    const file = await getFileById(id);

    if (!file) {
      return jsonError(c, 404, "FILE_NOT_FOUND", "File not found");
    }

    const authz = await authorizeOwnerResource(c, "file", id, file.uploaderId, "read");
    if (!authz.allowed) {
      return jsonError(c, 403, "FORBIDDEN", "Forbidden");
    }

    return c.json({ file });
  } catch (error) {
    console.error("Error fetching file:", error);
    return jsonError(c, 500, "FILE_FETCH_FAILED", "Failed to fetch file");
  }
});

// POST /api/files/upload - Upload file
filesRoutes.post("/upload", async (c) => {
  try {
    const user = c.get("user");
    if (!user?.id) {
      return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
    }

    const contentType = c.req.header("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      return jsonError(c, 400, "FILE_MULTIPART_REQUIRED", "Multipart form data required");
    }

    const body = await c.req.parseBody();
    const uploadedFile = body.file as File;

    if (!uploadedFile) {
      return jsonError(c, 400, "FILE_REQUIRED", "File is required");
    }

    const fileId = crypto.randomUUID();
    const filename = `${fileId}-${uploadedFile.name}`;
    const gcsPath = `uploads/${filename}`;

    const arrayBuffer = await uploadedFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const gcsFile = bucket.file(gcsPath);
    await gcsFile.save(buffer, {
      contentType: uploadedFile.type,
      metadata: {
        originalName: uploadedFile.name,
        uploaderId: user.id,
      },
    });

    const newFile = await createFile({
      id: fileId,
      filename: uploadedFile.name,
      contentType: uploadedFile.type,
      size: uploadedFile.size,
      gcsPath: `gs://${bucketName}/${gcsPath}`,
      uploaderId: user.id,
      createdAt: new Date(),
    });

    return c.json({ file: newFile }, 201);
  } catch (error) {
    console.error("Error uploading file:", error);
    return jsonError(c, 500, "FILE_UPLOAD_FAILED", "Failed to upload file");
  }
});

// GET /api/files/:id/download - Get signed URL for download
filesRoutes.get("/:id/download", async (c) => {
  const { id } = c.req.param();

  try {
    const fileRecord = await getFileById(id);

    if (!fileRecord) {
      return jsonError(c, 404, "FILE_NOT_FOUND", "File not found");
    }

    const authz = await authorizeOwnerResource(c, "file", id, fileRecord.uploaderId, "read");
    if (!authz.allowed) {
      return jsonError(c, 403, "FORBIDDEN", "Forbidden");
    }

    const pathMatch = fileRecord.gcsPath.match(/gs:\/\/[^/]+\/(.+)/);
    if (!pathMatch?.[1]) {
      return jsonError(c, 500, "FILE_PATH_INVALID", "Invalid file path");
    }

    const gcsPath = pathMatch[1];
    const gcsFile = bucket.file(gcsPath);

    const [signedUrl] = await gcsFile.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });

    return c.json({ url: signedUrl });
  } catch (error) {
    console.error("Error generating download URL:", error);
    return jsonError(c, 500, "FILE_DOWNLOAD_URL_FAILED", "Failed to generate download URL");
  }
});

// DELETE /api/files/:id - Delete file
filesRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();

  try {
    const fileRecord = await getFileById(id);

    if (!fileRecord) {
      return jsonError(c, 404, "FILE_NOT_FOUND", "File not found");
    }

    const authz = await authorizeOwnerResource(c, "file", id, fileRecord.uploaderId, "delete");
    if (!authz.allowed) {
      return jsonError(c, 403, "FORBIDDEN", "Forbidden");
    }

    const pathMatch = fileRecord.gcsPath.match(/gs:\/\/[^/]+\/(.+)/);
    if (pathMatch?.[1]) {
      const gcsPath = pathMatch[1];
      await bucket.file(gcsPath).delete();
    }

    await deleteFile(id);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    return jsonError(c, 500, "FILE_DELETE_FAILED", "Failed to delete file");
  }
});
