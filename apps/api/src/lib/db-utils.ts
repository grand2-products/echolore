/**
 * Extract first row from query result, return null if empty.
 */
export function firstOrNull<T>(rows: T[]): T | null {
  return rows[0] ?? null;
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
