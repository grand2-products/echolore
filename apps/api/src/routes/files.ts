import { Storage } from "@google-cloud/storage";
import { Hono } from "hono";
import type { AppEnv } from "../lib/auth.js";
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
    return c.json({ error: "Failed to fetch files" }, 500);
  }
});

// GET /api/files/:id - Get file metadata
filesRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();

  try {
    const file = await getFileById(id);

    if (!file) {
      return c.json({ error: "File not found" }, 404);
    }

    const authz = await authorizeOwnerResource(c, "file", id, file.uploaderId, "read");
    if (!authz.allowed) {
      return c.json({ error: "Forbidden" }, 403);
    }

    return c.json({ file });
  } catch (error) {
    console.error("Error fetching file:", error);
    return c.json({ error: "Failed to fetch file" }, 500);
  }
});

// POST /api/files/upload - Upload file
filesRoutes.post("/upload", async (c) => {
  try {
    const user = c.get("user");
    if (!user?.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const contentType = c.req.header("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      return c.json({ error: "Multipart form data required" }, 400);
    }

    const body = await c.req.parseBody();
    const uploadedFile = body.file as File;

    if (!uploadedFile) {
      return c.json({ error: "File is required" }, 400);
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
    return c.json({ error: "Failed to upload file" }, 500);
  }
});

// GET /api/files/:id/download - Get signed URL for download
filesRoutes.get("/:id/download", async (c) => {
  const { id } = c.req.param();

  try {
    const fileRecord = await getFileById(id);

    if (!fileRecord) {
      return c.json({ error: "File not found" }, 404);
    }

    const authz = await authorizeOwnerResource(c, "file", id, fileRecord.uploaderId, "read");
    if (!authz.allowed) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const pathMatch = fileRecord.gcsPath.match(/gs:\/\/[^/]+\/(.+)/);
    if (!pathMatch?.[1]) {
      return c.json({ error: "Invalid file path" }, 500);
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
    return c.json({ error: "Failed to generate download URL" }, 500);
  }
});

// DELETE /api/files/:id - Delete file
filesRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();

  try {
    const fileRecord = await getFileById(id);

    if (!fileRecord) {
      return c.json({ error: "File not found" }, 404);
    }

    const authz = await authorizeOwnerResource(c, "file", id, fileRecord.uploaderId, "delete");
    if (!authz.allowed) {
      return c.json({ error: "Forbidden" }, 403);
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
    return c.json({ error: "Failed to delete file" }, 500);
  }
});
