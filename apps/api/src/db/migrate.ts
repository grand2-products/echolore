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

// Read migration files
const migrationsDir = path.resolve(import.meta.dirname, "migrations");
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
