import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString && process.env.NODE_ENV !== "test") {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({
  connectionString: connectionString || "postgresql://localhost:5432/test",
});

export const db = drizzle(pool, { schema });

export { schema };
