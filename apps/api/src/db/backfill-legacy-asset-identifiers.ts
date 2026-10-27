import { mapLegacyAssetIdentifiers } from "@echolore/shared/contracts";
import type { Pool, PoolClient } from "pg";

/** Session lock so overlapping API processes do not append the legacy note twice. */
const LOCK_KEY = 8140020;

interface LegacyRow {
  type: string;
  external_id: string | null;
  measurement_ids: string[] | null;
  public_url: string | null;
  notes: string | null;
}

/**
 * Moves frozen external_id / measurement_ids into identifiers.
 * Claims each row with a conditional update inside one transaction.
 */
export async function backfillLegacyAssetIdentifiers(pool: Pool): Promise<void> {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    locked = true;
    const ids = await client.query<{ id: string }>(
      `SELECT id FROM marketing_assets
       WHERE legacy_identifiers_mapped = false
         AND (external_id IS NOT NULL OR measurement_ids <> '[]'::jsonb)`
    );
    let processed = 0;
    let unmapped = 0;
    let truncated = 0;
    for (const row of ids.rows) {
      const outcome = await mapOne(client, row.id);
      if (outcome === "skipped") continue;
      processed += 1;
      if (outcome.unmapped) unmapped += 1;
      if (outcome.truncated) truncated += 1;
    }
    console.log(
      `[marketing] legacy identifier backfill processed=${processed} unmapped=${unmapped} truncated=${truncated}`
    );
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    client.release();
  }
}

async function mapOne(client: PoolClient, id: string) {
  await client.query("BEGIN");
  try {
    const claimed = await client.query<LegacyRow>(
      `UPDATE marketing_assets
       SET legacy_identifiers_mapped = true
       WHERE id = $1 AND legacy_identifiers_mapped = false
       RETURNING type, external_id, measurement_ids, public_url, notes`,
      [id]
    );
    if (claimed.rowCount === 0) {
      await client.query("ROLLBACK");
      return "skipped" as const;
    }
    const row = claimed.rows[0];
    if (!row) throw new Error(`Legacy identifier claim returned no row for asset ${id}`);
    const input = {
      type: row.type,
      externalId: row.external_id,
      measurementIds: Array.isArray(row.measurement_ids) ? row.measurement_ids : [],
      publicUrl: row.public_url,
      notes: row.notes,
    };
    const first = mapLegacyAssetIdentifiers(input);
    const second = mapLegacyAssetIdentifiers(input);
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error(`Legacy identifier mapping is not stable for asset ${id}`);
    }
    await client.query(
      `UPDATE marketing_assets
       SET identifiers = $2::jsonb, public_url = $3, notes = $4
       WHERE id = $1`,
      [id, JSON.stringify(first.identifiers), first.publicUrl, first.notes]
    );
    const written = await client.query<{
      identifiers: Record<string, string>;
      public_url: string | null;
      notes: string | null;
    }>("SELECT identifiers, public_url, notes FROM marketing_assets WHERE id = $1", [id]);
    const saved = written.rows[0];
    const same =
      JSON.stringify(saved?.identifiers ?? {}) === JSON.stringify(first.identifiers) &&
      (saved?.public_url ?? null) === (first.publicUrl ?? null) &&
      (saved?.notes ?? null) === (first.notes ?? null);
    if (!same) throw new Error(`Legacy identifier write did not match the mapping for asset ${id}`);
    await client.query("COMMIT");
    return { unmapped: first.unmapped.length > 0, truncated: first.notesTruncated };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
