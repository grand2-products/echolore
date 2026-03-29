import { sql } from "kysely";
import { db } from "../db/index.js";
import type { Database } from "../db/schema.js";

/**
 * Extract first row from query result, return null if empty.
 */
export function firstOrNull<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

/** Convert snake_case keys to camelCase (raw SQL results bypass CamelCasePlugin). */
function snakeToCamel(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

/**
 * Fetch a single record by its `id` column, returning null when not found.
 */
export async function getRecordById<T extends keyof Database & string>(table: T, id: string) {
  const result = await sql`SELECT * FROM ${sql.table(table)} WHERE id = ${id} LIMIT 1`.execute(db);
  if (!result.rows[0]) return null;
  // biome-ignore lint/suspicious/noExplicitAny: raw SQL result needs camelCase conversion
  return snakeToCamel(result.rows[0] as Record<string, unknown>) as any;
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
