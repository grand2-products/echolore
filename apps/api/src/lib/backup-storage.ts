import { createWriteStream } from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { BackupStorageConfig } from "../services/admin/backup-settings-service.js";

export interface BackupEntry {
  name: string;
  size: number;
  createdAt: string;
}

const MAX_LIST_RESULTS = 100;

export async function listBackups(config: BackupStorageConfig): Promise<BackupEntry[]> {
  const raw = config.provider === "s3" ? await listRawS3(config) : await listRawGcs(config);

  return raw
    .filter((e) => e.name.endsWith(".dump"))
    .map((e) => ({ ...e, name: e.name.replace(/^db\//, "") }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function testBackupConnection(config: BackupStorageConfig): Promise<void> {
  if (config.provider === "s3") {
    const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
    const client = buildS3Client(config, S3Client);
    await client.send(new HeadBucketCommand({ Bucket: config.s3Bucket || "backups" }));
  } else {
    const { Storage } = await import("@google-cloud/storage");
    const bucket = buildGcsBucket(config, Storage);
    const [exists] = await bucket.exists();
    if (!exists) throw new Error("GCS bucket does not exist");
  }
}

interface RawEntry {
  name: string;
  size: number;
  createdAt: string;
}

async function listRawS3(config: BackupStorageConfig): Promise<RawEntry[]> {
  const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  // Inline construction to preserve type safety (buildS3Client returns any)
  const client = new S3Client({
    endpoint: config.s3Endpoint || undefined,
    region: config.s3Region || "us-east-1",
    credentials: {
      accessKeyId: config.s3AccessKey || "",
      secretAccessKey: config.s3SecretKey || "",
    },
    forcePathStyle: config.s3ForcePathStyle ?? true,
  });

  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: config.s3Bucket || "backups",
      Prefix: "db/",
      MaxKeys: MAX_LIST_RESULTS,
    })
  );

  if (!result.Contents) return [];

  return result.Contents.flatMap((obj) =>
    obj.Key != null
      ? [{ name: obj.Key, size: obj.Size ?? 0, createdAt: obj.LastModified?.toISOString() ?? "" }]
      : []
  );
}

async function listRawGcs(config: BackupStorageConfig): Promise<RawEntry[]> {
  const { Storage } = await import("@google-cloud/storage");
  const bucket = buildGcsBucket(config, Storage);

  const [files] = await bucket.getFiles({ prefix: "db/", maxResults: MAX_LIST_RESULTS });

  return files.map((f) => ({
    name: f.name,
    size: Number(f.metadata.size) || 0,
    createdAt: (f.metadata.timeCreated as string) ?? "",
  }));
}

//Upload (streaming pg_dump stdout → cloud)

export async function uploadBackupStream(
  config: BackupStorageConfig,
  key: string,
  stream: Readable
): Promise<void> {
  if (config.provider === "s3") {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const { Upload } = await import("@aws-sdk/lib-storage");
    const client = buildS3Client(config, S3Client);
    const upload = new Upload({
      client,
      params: {
        Bucket: config.s3Bucket || "backups",
        Key: key,
        Body: stream,
        ContentType: "application/octet-stream",
      },
    });
    await upload.done();
  } else {
    const { Storage } = await import("@google-cloud/storage");
    const bucket = buildGcsBucket(config, Storage);
    const writeStream = bucket.file(key).createWriteStream({ resumable: false });
    await pipeline(stream, writeStream);
  }
}

//Download (cloud → local file for pg_restore)

export async function downloadBackup(
  config: BackupStorageConfig,
  key: string,
  destPath: string
): Promise<void> {
  if (config.provider === "s3") {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = buildS3Client(config, S3Client);
    const res = await client.send(
      new GetObjectCommand({ Bucket: config.s3Bucket || "backups", Key: key })
    );
    if (!res.Body) throw new Error("Empty response body from S3");
    await pipeline(res.Body as Readable, createWriteStream(destPath));
  } else {
    const { Storage } = await import("@google-cloud/storage");
    const bucket = buildGcsBucket(config, Storage);
    await bucket.file(key).download({ destination: destPath });
  }
}

//Delete

export async function deleteBackup(config: BackupStorageConfig, key: string): Promise<void> {
  if (config.provider === "s3") {
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = buildS3Client(config, S3Client);
    await client.send(new DeleteObjectCommand({ Bucket: config.s3Bucket || "backups", Key: key }));
  } else {
    const { Storage } = await import("@google-cloud/storage");
    const bucket = buildGcsBucket(config, Storage);
    await bucket.file(key).delete({ ignoreNotFound: true });
  }
}

//Shared helpers

// biome-ignore lint/suspicious/noExplicitAny: SDK constructor type is complex
function buildS3Client(config: BackupStorageConfig, S3ClientCtor: any) {
  return new S3ClientCtor({
    endpoint: config.s3Endpoint || undefined,
    region: config.s3Region || "us-east-1",
    credentials: {
      accessKeyId: config.s3AccessKey || "",
      secretAccessKey: config.s3SecretKey || "",
    },
    forcePathStyle: config.s3ForcePathStyle ?? true,
  });
}

function buildGcsBucket(
  config: BackupStorageConfig,
  StorageCtor: typeof import("@google-cloud/storage").Storage
) {
  const opts: ConstructorParameters<typeof StorageCtor>[0] = {};
  if (config.gcsProjectId) opts.projectId = config.gcsProjectId;
  if (config.gcsKeyJson) {
    try {
      opts.credentials = JSON.parse(config.gcsKeyJson);
    } catch (e) {
      console.warn(
        "Failed to parse backup GCS key JSON, falling back to ADC:",
        (e as Error).message
      );
    }
  }
  const storage = new StorageCtor(opts);
  return storage.bucket(config.gcsBucket || "backups");
}
