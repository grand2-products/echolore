import { db } from "../../db/index.js";
import type { LlmConfigSet, NewLlmConfigSet } from "../../db/schema.js";
import { firstOrNull } from "../../lib/db-utils.js";

export async function listAllConfigSets(): Promise<LlmConfigSet[]> {
  return db.selectFrom("llm_config_sets").selectAll().orderBy("createdAt", "asc").execute();
}

export async function getConfigSetById(id: string): Promise<LlmConfigSet | null> {
  return firstOrNull(
    await db.selectFrom("llm_config_sets").selectAll().where("id", "=", id).execute()
  );
}

export async function createConfigSet(input: NewLlmConfigSet): Promise<LlmConfigSet | null> {
  return (
    (await db.insertInto("llm_config_sets").values(input).returningAll().executeTakeFirst()) ?? null
  );
}

export async function updateConfigSet(
  id: string,
  input: Partial<NewLlmConfigSet>
): Promise<LlmConfigSet | null> {
  return (
    (await db
      .updateTable("llm_config_sets")
      .set(input)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function deleteConfigSet(id: string): Promise<boolean> {
  const result = await db
    .deleteFrom("llm_config_sets")
    .where("id", "=", id)
    .returningAll()
    .execute();
  return result.length > 0;
}

export async function countAgentsByConfigSetId(configSetId: string): Promise<number> {
  const result = await db
    .selectFrom("agents")
    .select(db.fn.count<number>("id").as("count"))
    .where("llmConfigSetId", "=", configSetId)
    .executeTakeFirst();
  return Number(result?.count ?? 0);
}
