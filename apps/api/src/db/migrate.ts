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

// Migrate history from Drizzle's __drizzle_migrations if it exists.
// This is one-time bootstrap code that is harmless to keep — it handles
// the transition from Drizzle to Kysely migrations and no-ops once the
// table has been dropped.
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

// For existing DBs upgraded from Drizzle without migration tracking.
// TODO(cleanup): This landmark-based seeding can be removed after all
// environments have been upgraded past v0.1.24 (i.e. _migrations is
// already populated). It is harmless to keep but adds startup complexity.
const { rows: tracked } = await pool.query("SELECT count(*)::int as cnt FROM _migrations");
if ((tracked[0]?.cnt ?? 0) === 0) {
  const landmarks: Array<{ migration: string; table: string }> = [
    { migration: "0000_far_katie_power", table: "users" },
    { migration: "0001_tough_ma_gnuci", table: "meeting_invites" },
    { migration: "0002_amusing_gamora", table: "ai_chat_messages" },
    { migration: "0003_young_northstar", table: "meeting_participants" },
  ];
  for (const { migration, table } of landmarks) {
    const { rows } = await pool.query(
      "SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1",
      [table]
    );
    if (rows.length === 0) break;
    await pool.query("INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [
      migration,
    ]);
  }
  const { rows: fkCheck } = await pool.query(
    "SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'agents_created_by_users_id_fk' AND constraint_type = 'FOREIGN KEY'"
  );
  if (fkCheck.length > 0) {
    await pool.query("INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [
      "0004_glamorous_rhodey",
    ]);
    await pool.query("INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [
      "0005_daily_slayback",
    ]);
  }
  const { rows: seeded } = await pool.query("SELECT count(*)::int as cnt FROM _migrations");
  if ((seeded[0]?.cnt ?? 0) > 0) {
    console.log(`Seeded _migrations with ${seeded[0]?.cnt} existing entries`);
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
