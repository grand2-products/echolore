import { realpathSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path, { dirname, isAbsolute, normalize, relative, resolve } from "node:path";

// ---------------------------------------------------------------------------
// StorageProvider interface
// ---------------------------------------------------------------------------

export interface StorageProvider {
  save(relativePath: string, data: Buffer, contentType?: string): Promise<void>;
  load(relativePath: string): Promise<Buffer>;
  remove(relativePath: string): Promise<void>;
}

export type StorageProviderType = "local" | "s3" | "gcs";

export interface StorageProviderConfig {
  provider: StorageProviderType;
  // Local
  localPath?: string;
  // S3-compatible
  s3Endpoint?: string;
  s3Region?: string;
  s3Bucket?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3ForcePathStyle?: boolean;
  // GCS
  gcsBucket?: string;
  gcsProjectId?: string;
  gcsKeyJson?: string;
}

// ---------------------------------------------------------------------------
// Local filesystem provider
// ---------------------------------------------------------------------------

class LocalStorageProvider implements StorageProvider {
  constructor(private readonly root: string) {}

  private resolveSafe(relativePath: string): string {
    const resolved = resolve(this.root, relativePath);
    const rootResolved = resolve(this.root);
    const rel = relative(rootResolved, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("Path traversal is not allowed");
    }
    // Follow symlinks to verify the real path is still under root
    try {
      const realResolved = realpathSync(resolved);
      const realRoot = realpathSync(rootResolved);
      const realRel = relative(realRoot, realResolved);
      if (realRel.startsWith("..") || path.isAbsolute(realRel)) {
        throw new Error("Path traversal is not allowed");
      }
    } catch {
      // Path may not exist yet (e.g., during creation); skip symlink check
    }
    return resolved;
  }

  async save(relativePath: string, data: Buffer): Promise<void> {
    const fullPath = this.resolveSafe(relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  async load(relativePath: string): Promise<Buffer> {
    return readFile(this.resolveSafe(relativePath));
  }

  async remove(relativePath: string): Promise<void> {
    try {
      await rm(this.resolveSafe(relativePath), { force: true });
    } catch {
      // ignore if file does not exist
    }
  }
}

// ---------------------------------------------------------------------------
// S3-compatible provider (lazy-loaded)
// ---------------------------------------------------------------------------

class S3StorageProvider implements StorageProvider {
  private clientPromise: Promise<{
    client: import("@aws-sdk/client-s3").S3Client;
    bucket: string;
  }>;

  constructor(private readonly config: StorageProviderConfig) {
    this.clientPromise = this.initClient();
  }

  private async initClient() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      endpoint: this.config.s3Endpoint || undefined,
      region: this.config.s3Region || "us-east-1",
      credentials: {
        accessKeyId: this.config.s3AccessKey || "",
        secretAccessKey: this.config.s3SecretKey || "",
      },
      forcePathStyle: this.config.s3ForcePathStyle ?? true,
    });
    return { client, bucket: this.config.s3Bucket || "files" };
  }

  async save(relativePath: string, data: Buffer, contentType?: string): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { client, bucket } = await this.clientPromise;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: relativePath,
        Body: data,
        ContentType: contentType,
      })
    );
  }

  async load(relativePath: string): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { client, bucket } = await this.clientPromise;
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: relativePath }));
    const stream = res.Body;
    if (!stream) throw new Error("Empty response body from S3");
    return Buffer.from(await stream.transformToByteArray());
  }

  async remove(relativePath: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const { client, bucket } = await this.clientPromise;
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: relativePath }));
    } catch {
      // ignore if object does not exist
    }
  }
}

// ---------------------------------------------------------------------------
// GCS provider (lazy-loaded)
// ---------------------------------------------------------------------------

class GcsStorageProvider implements StorageProvider {
  private bucketPromise: Promise<import("@google-cloud/storage").Bucket>;

  constructor(private readonly config: StorageProviderConfig) {
    this.bucketPromise = this.initBucket();
  }

  private async initBucket() {
    const { Storage } = await import("@google-cloud/storage");
    const opts: ConstructorParameters<typeof Storage>[0] = {};
    if (this.config.gcsProjectId) opts.projectId = this.config.gcsProjectId;
    if (this.config.gcsKeyJson) {
      try {
        opts.credentials = JSON.parse(this.config.gcsKeyJson);
      } catch {
        // fall back to ADC
      }
    }
    const storage = new Storage(opts);
    return storage.bucket(this.config.gcsBucket || "files");
  }

  async save(relativePath: string, data: Buffer, contentType?: string): Promise<void> {
    const bucket = await this.bucketPromise;
    const file = bucket.file(relativePath);
    await file.save(data, { contentType });
  }

  async load(relativePath: string): Promise<Buffer> {
    const bucket = await this.bucketPromise;
    const [buffer] = await bucket.file(relativePath).download();
    return buffer;
  }

  async remove(relativePath: string): Promise<void> {
    const bucket = await this.bucketPromise;
    try {
      await bucket.file(relativePath).delete();
    } catch {
      // ignore if file does not exist
    }
  }
}

// ---------------------------------------------------------------------------
// Provider factory and singleton
// ---------------------------------------------------------------------------

export function createStorageProvider(config: StorageProviderConfig): StorageProvider {
  switch (config.provider) {
    case "s3":
      return new S3StorageProvider(config);
    case "gcs":
      return new GcsStorageProvider(config);
    default:
      return new LocalStorageProvider(
        config.localPath || process.env.FILE_STORAGE_PATH || "/data/files"
      );
  }
}

let currentProvider: StorageProvider = new LocalStorageProvider(
  process.env.FILE_STORAGE_PATH || "/data/files"
);

export function setStorageProvider(provider: StorageProvider): void {
  currentProvider = provider;
}

// ---------------------------------------------------------------------------
// Convenience functions (used by existing route code)
// ---------------------------------------------------------------------------

export async function saveFile(
  relativePath: string,
  data: Buffer,
  contentType?: string
): Promise<void> {
  return currentProvider.save(relativePath, data, contentType);
}

export async function loadFile(relativePath: string): Promise<Buffer> {
  return currentProvider.load(relativePath);
}

export async function removeFile(relativePath: string): Promise<void> {
  return currentProvider.remove(relativePath);
}

/**
 * Validate and normalize a relative storage path.
 * Rejects path traversal attempts (../, absolute paths, null bytes).
 */
export function buildStoragePath(relativePath: string): string {
  if (!relativePath || isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new Error("Invalid storage path");
  }
  const normalized = normalize(relativePath).replace(/\\/g, "/");
  if (normalized.startsWith("..") || normalized.includes("/..")) {
    throw new Error("Path traversal is not allowed");
  }
  return normalized;
}
