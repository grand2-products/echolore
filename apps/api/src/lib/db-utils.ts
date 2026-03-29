import { sql } from "kysely";
import { db } from "../db/index.js";
import type { Database } from "../db/schema.js";

/**
 * Extract first row from query result, return null if empty.
 */
export function firstOrNull<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

/**
 * Fetch a single record by its `id` column, returning null when not found.
 */
export async function getRecordById<T extends keyof Database & string>(table: T, id: string) {
  const result = await sql`SELECT * FROM ${sql.table(table)} WHERE id = ${id} LIMIT 1`.execute(db);
  // biome-ignore lint/suspicious/noExplicitAny: raw SQL result requires cast
  return (result.rows[0] as any) ?? null;
}

/**
 * Create-or-return pattern with race condition handling.
 * Used for idempotent "ensure exists" operations.
 */
export async function ensureRecord<T>(config: {
  find: () => Promise<T | null>;
  create: () => Promise<T | null>;
  errorMessage: string;
}): Promise<T> {
  const existing = await config.find();
  if (existing) return existing;
  try {
    const created = await config.create();
    if (!created) throw new Error(config.errorMessage);
    return created;
  } catch (cause) {
    const retry = await config.find();
    if (retry) return retry;
    throw new Error(config.errorMessage, { cause });
  }
}

/**
 * Create and throw if null result.
 */
export async function createOrThrow<T>(
  operation: () => Promise<T | null>,
  errorMessage: string
): Promise<T> {
  const result = await operation();
  if (result == null) throw new Error(errorMessage);
  return result;
}

/**
 * Escape SQL LIKE/ILIKE wildcard characters in user input.
 * Callers must include `ESCAPE '\'` in the SQL clause for the escaping to take effect.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}
