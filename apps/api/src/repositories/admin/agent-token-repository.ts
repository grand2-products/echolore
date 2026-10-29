import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import type { AgentToken } from "../../db/schema.js";

export async function createAgentTokenRow(input: {
  name: string;
  tokenHash: string;
  scopes: string[];
  createdByUserId: string;
}): Promise<AgentToken> {
  const now = new Date();
  return db
    .insertInto("agent_tokens")
    .values({
      id: `agt_${nanoid(16)}`,
      name: input.name,
      tokenHash: input.tokenHash,
      scopes: input.scopes,
      createdByUserId: input.createdByUserId,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listAgentTokenRows(): Promise<AgentToken[]> {
  return db.selectFrom("agent_tokens").selectAll().orderBy("createdAt", "desc").execute();
}

export async function revokeAgentTokenRow(id: string): Promise<AgentToken | null> {
  return (
    (await db
      .updateTable("agent_tokens")
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where("id", "=", id)
      .where("revokedAt", "is", null)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function findActiveAgentTokenByHash(tokenHash: string): Promise<AgentToken | null> {
  return (
    (await db
      .selectFrom("agent_tokens")
      .selectAll()
      .where("tokenHash", "=", tokenHash)
      .where("revokedAt", "is", null)
      .executeTakeFirst()) ?? null
  );
}

export async function touchAgentTokenLastUsed(id: string): Promise<void> {
  await db
    .updateTable("agent_tokens")
    .set({ lastUsedAt: new Date() })
    .where("id", "=", id)
    .execute();
}
