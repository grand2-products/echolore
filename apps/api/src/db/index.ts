import { CamelCasePlugin, Kysely, PostgresDialect, type Transaction } from "kysely";
import { Pool } from "pg";
import { JsonbStringifyPlugin } from "./plugins/jsonb-stringify-plugin.js";
import type { Database } from "./schema/database.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString && process.env.NODE_ENV !== "test") {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({
  connectionString: connectionString || "postgresql://localhost:5432/test",
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
  plugins: [new CamelCasePlugin(), new JsonbStringifyPlugin()],
});

export type DbTransaction = Transaction<Database>;
