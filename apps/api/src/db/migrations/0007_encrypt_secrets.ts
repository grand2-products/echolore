/**
 * One-time migration: encrypt plaintext secrets in site_settings.
 *
 * Run via: npx tsx apps/api/src/db/migrations/0007_encrypt_secrets.ts
 *
 * Reads each secret key, checks if it's already encrypted (base64 with
 * expected prefix), and encrypts plaintext values in-place.
 *
 * Safe to run multiple times — already-encrypted values are skipped.
 */
import { decrypt, encrypt } from "../../lib/crypto.js";
import { db } from "../index.js";

const SECRET_KEYS = [
  // LLM
  "llmGeminiApiKey",
  "llmZhipuApiKey",
  "llmOpenaiCompatApiKey",
  // Email
  "emailResendApiKey",
  "emailSmtpPass",
  // Storage
  "storageS3SecretKey",
  "storageGcsKeyJson",
  // Backup
  "backupS3SecretKey",
  "backupGcsKeyJson",
  // GCP
  "gcpServiceAccountKeyJson",
];

function isAlreadyEncrypted(value: string): boolean {
  try {
    decrypt(value);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("Encrypting plaintext secrets in site_settings...");

  let encrypted = 0;
  let skipped = 0;

  for (const key of SECRET_KEYS) {
    const row = await db
      .selectFrom("site_settings")
      .select(["key", "value"])
      .where("key", "=", key)
      .executeTakeFirst();

    if (!row || !row.value) {
      skipped++;
      continue;
    }

    if (isAlreadyEncrypted(row.value)) {
      console.log(`  [skip] ${key} (already encrypted)`);
      skipped++;
      continue;
    }

    const encryptedValue = encrypt(row.value);
    await db
      .updateTable("site_settings")
      .set({ value: encryptedValue, updatedAt: new Date() })
      .where("key", "=", key)
      .execute();

    console.log(`  [done] ${key}`);
    encrypted++;
  }

  console.log(`\nComplete: ${encrypted} encrypted, ${skipped} skipped.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
