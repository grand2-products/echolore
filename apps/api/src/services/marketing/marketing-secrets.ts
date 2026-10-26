import { decrypt, encrypt } from "../../lib/crypto.js";

/**
 * Connector credentials are stored as one AES-256-GCM encrypted JSON blob.
 * They are decrypted only inside the sync process and never returned to
 * clients; the API exposes which secret fields are set, not their values.
 */

export function decryptSecrets(secretsEnc: string | null): Record<string, string> {
  if (!secretsEnc) return {};
  try {
    const parsed = JSON.parse(decrypt(secretsEnc)) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""
      )
    );
  } catch {
    console.error("[marketing] Failed to decrypt connector secrets (ENCRYPTION_KEY changed?)");
    return {};
  }
}

/**
 * Merge write-only secret updates: omitted keys keep their value, empty
 * strings clear the key, unknown keys are ignored.
 */
export function mergeSecrets(
  current: Record<string, string>,
  updates: Record<string, string> | undefined,
  allowedKeys: string[]
): Record<string, string> {
  const next = { ...current };
  for (const [key, value] of Object.entries(updates ?? {})) {
    if (!allowedKeys.includes(key)) continue;
    if (value === "") delete next[key];
    else next[key] = value;
  }
  for (const key of Object.keys(next)) {
    if (!allowedKeys.includes(key)) delete next[key];
  }
  return next;
}

export function encryptSecrets(secrets: Record<string, string>): string | null {
  return Object.keys(secrets).length > 0 ? encrypt(JSON.stringify(secrets)) : null;
}
