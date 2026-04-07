import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  deleteBackup,
  downloadBackup,
  listBackups,
  uploadBackupStream,
} from "../../lib/backup-storage.js";
import { sendEmail } from "../../lib/email.js";
import { completeJob, updateProgress, updateTargetFile } from "./backup-job-service.js";
import type { BackupStorageConfig } from "./backup-settings-service.js";
import { buildBackupStorageConfig, getBackupSettings } from "./backup-settings-service.js";

const MAX_STDERR_LENGTH = 65_536;
const SAFE_BACKUP_NAME = /^[\w\-.]+$/;

const ALLOWED_WEBHOOK_PREFIXES = ["https://hooks.slack.com/", "https://discord.com/api/webhooks/"];

function validateBackupName(name: string): void {
  if (!SAFE_BACKUP_NAME.test(name)) {
    throw new Error(`Invalid backup name: ${name}`);
  }
}

function isAllowedWebhookUrl(url: string): boolean {
  return ALLOWED_WEBHOOK_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .replace(/\.\d+Z$/, "")
    .replace(/(\d{8})(\d{6})/, "$1-$2");
}

function captureStderr(proc: import("node:child_process").ChildProcess): () => string {
  let buf = "";
  proc.stderr?.on("data", (chunk: Buffer) => {
    if (buf.length < MAX_STDERR_LENGTH) {
      buf += chunk.toString().slice(0, MAX_STDERR_LENGTH - buf.length);
    }
  });
  return () => buf.trim();
}

export async function executeBackup(): Promise<void> {
  const filename = `db-${timestamp()}.dump`;
  updateTargetFile(filename);

  let slackWebhookUrl: string | null = null;
  let notificationEmail: string | null = null;

  try {
    const settings = await getBackupSettings();
    if (!settings.provider) throw new Error("Backup provider is not configured");
    slackWebhookUrl = settings.slackWebhookUrl;
    notificationEmail = settings.notificationEmail;
    const config = await buildBackupStorageConfig(settings);
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is not set");

    updateProgress("Dumping database...");
    const key = `db/${filename}`;

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-acl", databaseUrl], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      const getStderr = captureStderr(proc);
      const uploadPromise = uploadBackupStream(config, key, proc.stdout).catch(reject);

      proc.on("error", (err) => reject(new Error(`pg_dump spawn failed: ${err.message}`)));
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`pg_dump exited with code ${code}: ${getStderr()}`));
        } else {
          void uploadPromise.then(resolve);
        }
      });
    });

    updateProgress("Cleaning up old backups...");
    await cleanupRetention(config, settings.retentionDays);

    completeJob("success");
    await sendSlackNotification(slackWebhookUrl, "backup", "success", filename);
    await sendEmailNotification(notificationEmail, "backup", "success", filename);
  } catch (e) {
    const msg = (e as Error).message;
    completeJob("error", msg);
    await sendSlackNotification(slackWebhookUrl, "backup", "error", filename, msg);
    await sendEmailNotification(notificationEmail, "backup", "error", filename, msg);
    throw e;
  }
}

export async function executeRestore(backupName: string): Promise<void> {
  validateBackupName(backupName);
  const tmpPath = join("/tmp", backupName);
  let slackWebhookUrl: string | null = null;
  let notificationEmail: string | null = null;

  try {
    const settings = await getBackupSettings();
    if (!settings.provider) throw new Error("Backup provider is not configured");
    slackWebhookUrl = settings.slackWebhookUrl;
    notificationEmail = settings.notificationEmail;
    const config = await buildBackupStorageConfig(settings);
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is not set");

    updateProgress("Downloading backup...");
    await downloadBackup(config, `db/${backupName}`, tmpPath);

    updateProgress("Restoring database (connections may briefly fail)...");
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        "pg_restore",
        ["--clean", "--if-exists", "--no-owner", "--no-acl", "-d", databaseUrl, tmpPath],
        { stdio: ["ignore", "ignore", "pipe"] }
      );

      const getStderr = captureStderr(proc);

      proc.on("error", (err) => reject(new Error(`pg_restore spawn failed: ${err.message}`)));
      proc.on("close", (code) => {
        // pg_restore returns 0 on success, 1 on warnings (e.g., "relation does not exist" during --clean)
        if (code !== null && code > 1) {
          reject(new Error(`pg_restore exited with code ${code}: ${getStderr()}`));
        } else {
          resolve();
        }
      });
    });

    completeJob("success");
    await sendSlackNotification(slackWebhookUrl, "restore", "success", backupName);
    await sendEmailNotification(notificationEmail, "restore", "success", backupName);
  } catch (e) {
    const msg = (e as Error).message;
    completeJob("error", msg);
    await sendSlackNotification(slackWebhookUrl, "restore", "error", backupName, msg);
    await sendEmailNotification(notificationEmail, "restore", "error", backupName, msg);
    throw e;
  } finally {
    rm(tmpPath, { force: true }).catch(() => {});
  }
}

async function sendSlackNotification(
  webhookUrl: string | null,
  operation: "backup" | "restore",
  result: "success" | "error",
  filename: string,
  errorMessage?: string
): Promise<void> {
  if (!webhookUrl) return;
  try {
    if (!isAllowedWebhookUrl(webhookUrl)) {
      console.warn("Slack notification skipped: webhook URL is not an allowed provider");
      return;
    }

    const isSuccess = result === "success";
    const emoji = isSuccess ? "\u2705" : "\u274c";
    const status = isSuccess ? "completed" : "failed";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          text: `${emoji} EchoLore ${operation} ${status}: ${filename}`,
          attachments: [
            {
              color: isSuccess ? "#36a64f" : "#d32f2f",
              fields: [
                { title: "Operation", value: operation, short: true },
                { title: "File", value: filename, short: true },
                ...(errorMessage ? [{ title: "Error", value: errorMessage, short: false }] : []),
              ],
            },
          ],
        }),
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    console.warn("Slack notification failed (non-fatal):", (e as Error).message);
  }
}

async function sendEmailNotification(
  email: string | null,
  operation: "backup" | "restore",
  result: "success" | "error",
  filename: string,
  errorMessage?: string
): Promise<void> {
  if (!email) return;
  try {
    const isSuccess = result === "success";
    const status = isSuccess ? "completed" : "failed";
    await sendEmail(
      {
        to: email,
        subject: `EchoLore ${operation} ${status}: ${filename}`,
        text: [
          `EchoLore ${operation} ${status}.`,
          `Operation: ${operation}`,
          `File: ${filename}`,
          `Result: ${status}`,
          ...(errorMessage ? [`Error: ${errorMessage}`] : []),
          `Timestamp: ${new Date().toISOString()}`,
        ].join("\n"),
      },
      "BACKUP_NOTIFY"
    );
  } catch (e) {
    console.warn("Backup email notification failed (non-fatal):", (e as Error).message);
  }
}

async function cleanupRetention(
  config: BackupStorageConfig,
  retentionDays: number | null
): Promise<void> {
  if (!retentionDays || retentionDays <= 0) return;

  try {
    const backups = await listBackups(config);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    for (const backup of backups) {
      if (!backup.createdAt) continue;
      if (new Date(backup.createdAt) < cutoff) {
        await deleteBackup(config, `db/${backup.name}`);
      }
    }
  } catch (e) {
    console.warn("Retention cleanup failed (non-fatal):", (e as Error).message);
  }
}
