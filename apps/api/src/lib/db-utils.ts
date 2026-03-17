import { eq } from "drizzle-orm";
import type { PgColumn, PgTable, TableConfig } from "drizzle-orm/pg-core";
import { db } from "../db/index.js";

/**
 * Extract first row from query result, return null if empty.
 */
export function firstOrNull<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

/**
 * Fetch a single record by its `id` column, returning null when not found.
 */
export async function getRecordById<T extends PgTable<TableConfig> & { id: PgColumn }>(
  table: T,
  id: string
): Promise<T["$inferSelect"] | null> {
  return firstOrNull(
    await db
      .select()
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle's from() conditional type requires cast
      .from(table as any)
      .where(eq(table.id, id))
  );
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
