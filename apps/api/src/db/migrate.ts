import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

console.log("Ensuring pgvector extension...");
await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");

console.log("Running migrations...");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied successfully");

await pool.end();
process.exit(0);
