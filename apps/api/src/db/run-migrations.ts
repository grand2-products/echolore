import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Pool } from "pg";

/**
 * Run all pending SQL migrations from the migrations directory.
 *
 * 1. Ensures the pgvector extension exists.
 * 2. Creates the `_migrations` tracking table if missing.
 * 3. Reads `*.sql` files from `db/migrations/`, applies any that
 *    are not yet recorded in `_migrations`.
 */
export async function runMigrations(pool: Pool): Promise<void> {
  // 1. pgvector extension
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");

  // 2. Tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // 3. Discover & apply pending migrations
  const migrationsDir = path.resolve(import.meta.dirname, "migrations");
  const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const name = file.replace(/\.sql$/, "");
    const { rows } = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [name]);
    if (rows.length > 0) continue;

    console.log(`Applying migration: ${file}`);
    const sqlText = await fs.readFile(path.join(migrationsDir, file), "utf-8");
    await pool.query(sqlText);
    await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
  }
}
