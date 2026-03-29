import { Pool } from "pg";
import { runMigrations } from "./run-migrations.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  await runMigrations(pool);
  console.log("Migrations applied successfully");
} catch (err) {
  console.error("Database migration failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}

process.exit(0);
