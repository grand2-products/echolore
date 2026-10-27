import { isTruncatedLegacyAppendix } from "@echolore/shared/contracts";
import { Pool } from "pg";

/**
 * Warns when a legacy-identifier appendix was cut at 5000 characters.
 * The count does not have to be zero before the old columns are dropped.
 * Tokens are not printed.
 */
export async function listTruncatedLegacyAppendices(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ id: string; notes: string | null }>(
    `SELECT id, notes FROM marketing_assets
     WHERE notes LIKE '%[legacy-identifiers]%'`
  );
  return result.rows.filter((row) => isTruncatedLegacyAppendix(row.notes)).map((row) => row.id);
}

const isDirectRun = process.argv[1]?.includes("check-legacy-identifiers");
if (isDirectRun) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const ids = await listTruncatedLegacyAppendices(pool);
    console.log(`[marketing] truncated legacy identifier appendices=${ids.length}`);
    for (const id of ids) console.log(id);
  } finally {
    await pool.end();
  }
}
