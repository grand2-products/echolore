import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Ensure pgvector extension
console.log("Ensuring pgvector extension...");
await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");

// Ensure migrations tracking table
await pool.query(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

// Migrate history from Drizzle's __drizzle_migrations if it exists
try {
  const { rows: drizzleTable } = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '__drizzle_migrations'"
  );
  if (drizzleTable.length > 0) {
    await pool.query(`
      INSERT INTO _migrations (name, applied_at)
      SELECT tag, to_timestamp(created_at / 1000.0) FROM "__drizzle_migrations"
      ON CONFLICT (name) DO NOTHING
    `);
    await pool.query('DROP TABLE "__drizzle_migrations"');
    console.log("Migrated history from __drizzle_migrations");
  }
} catch {
  // __drizzle_migrations does not exist — fresh install or already migrated
}

// Read migration files
const migrationsDir = path.resolve(import.meta.dirname, "migrations");

// For existing DBs without any migration tracking: seed all as applied
const { rows: existingTables } = await pool.query(
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users'"
);
if (existingTables.length > 0) {
  const { rows: tracked } = await pool.query("SELECT count(*)::int as cnt FROM _migrations");
  if ((tracked[0]?.cnt ?? 0) === 0) {
    const allFiles = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    for (const f of allFiles) {
      const n = f.replace(/\.sql$/, "");
      await pool.query("INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [n]);
    }
    console.log("Seeded _migrations for existing database");
  }
}

const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

// Apply pending migrations
for (const file of files) {
  const name = file.replace(/\.sql$/, "");
  const { rows } = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [name]);
  if (rows.length > 0) continue;

  console.log(`Applying migration: ${file}`);
  const sql = await fs.readFile(path.join(migrationsDir, file), "utf-8");
  await pool.query(sql);
  await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
}

console.log("Migrations applied successfully");
await pool.end();
process.exit(0);
