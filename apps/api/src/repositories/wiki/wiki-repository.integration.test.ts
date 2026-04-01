/**
 * Integration tests for CamelCasePlugin column mapping across all repositories.
 *
 * Kysely's CamelCasePlugin converts snake_case SQL aliases to camelCase in
 * result rows. These tests verify that all raw `sql` queries and query-builder
 * `as` aliases are accessed with the correct camelCase keys.
 *
 * Run standalone:
 *   DATABASE_URL=postgresql://wiki:dogfood_password@localhost:17824/wiki \
 *     npx vitest run apps/api/src/repositories/wiki/wiki-repository.integration.test.ts
 *
 * Run via Docker (self-contained):
 *   docker compose -f docker-compose.test.yml run --rm test
 */
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { runMigrations } from "../../db/run-migrations.js";
import { listConversations } from "../ai-chat/ai-chat-repository.js";
import { findUserByEmailWithPasswordIdentity } from "../auth/auth-repository.js";
import { listAutonomousActiveSessions } from "../meeting/meeting-realtime-repository.js";
import {
  getPageSpaceType,
  listPagesOrderedByUpdatedAt,
  searchPagesByIlike,
} from "./wiki-repository.js";

const hasDb = Boolean(process.env.DATABASE_URL);

// Fixed IDs to avoid collisions with real data
const ID = {
  space: "00000000-0000-0000-0000-integration01",
  page: "00000000-0000-0000-0000-integration02",
  user: "00000000-0000-0000-0000-integration03",
  block: "00000000-0000-0000-0000-integration04",
  identity: "00000000-0000-0000-0000-integration05",
  conversation: "00000000-0000-0000-0000-integration06",
  agent: "00000000-0000-0000-0000-integration07",
  session: "00000000-0000-0000-0000-integration08",
  meeting: "00000000-0000-0000-0000-integration09",
};

describe.skipIf(!hasDb)("CamelCasePlugin integration (real DB)", () => {
  beforeAll(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await runMigrations(pool);
    await pool.end();

    // --- Seed test data ---

    await db
      .insertInto("spaces")
      .values({
        id: ID.space,
        name: "Integration Test Space",
        type: "general",
        ownerUserId: null,
        groupId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    await db
      .insertInto("users")
      .values({
        id: ID.user,
        email: "camelcase-integration@test.local",
        name: "Integration Tester",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    // Password identity for auth test
    await db
      .insertInto("auth_identities")
      .values({
        id: ID.identity,
        userId: ID.user,
        provider: "password",
        providerUserId: "camelcase-integration@test.local",
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$fake$fakehash",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    await db
      .insertInto("pages")
      .values({
        id: ID.page,
        title: "CamelCase検証ページ",
        spaceId: ID.space,
        authorId: ID.user,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    await db
      .insertInto("blocks")
      .values({
        id: ID.block,
        pageId: ID.page,
        type: "paragraph",
        content: "XyzIntegrationMarker: CamelCasePlugin統合テスト用ブロック",
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    // AI chat conversation for creator_name test
    await db
      .insertInto("ai_chat_conversations")
      .values({
        id: ID.conversation,
        title: "CamelCase Integration Chat",
        creatorId: ID.user,
        visibility: "public",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    // Meeting for agent session test
    await db
      .insertInto("meetings")
      .values({
        id: ID.meeting,
        title: "Integration Meeting",
        creatorId: ID.user,
        roomName: `integration-room-${ID.meeting}`,
        status: "active",
        createdAt: new Date(),
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    // Agent for session test
    await db
      .insertInto("agents")
      .values({
        id: ID.agent,
        name: "Test Agent",
        description: "For integration test",
        systemPrompt: "You are a test agent",
        interventionStyle: "reactive",
        defaultProvider: "google",
        isActive: true,
        autonomousEnabled: true,
        autonomousCooldownSec: 60,
        createdBy: ID.user,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    // Agent session
    await db
      .insertInto("meeting_agent_sessions")
      .values({
        id: ID.session,
        meetingId: ID.meeting,
        agentId: ID.agent,
        state: "active",
        invokedByUserId: ID.user,
        joinedAt: new Date(),
        createdAt: new Date(),
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom("meeting_agent_sessions").where("id", "=", ID.session).execute();
    await db.deleteFrom("agents").where("id", "=", ID.agent).execute();
    await db.deleteFrom("meetings").where("id", "=", ID.meeting).execute();
    await db.deleteFrom("ai_chat_conversations").where("id", "=", ID.conversation).execute();
    await db.deleteFrom("blocks").where("id", "=", ID.block).execute();
    await db.deleteFrom("pages").where("id", "=", ID.page).execute();
    await db.deleteFrom("auth_identities").where("id", "=", ID.identity).execute();
    await db.deleteFrom("users").where("id", "=", ID.user).execute();
    await db.deleteFrom("spaces").where("id", "=", ID.space).execute();
    await db.destroy();
  });

  // ── wiki-repository ──────────────────────────────────────────

  describe("searchPagesByIlike", () => {
    it("returns pageId, pageTitle, chunkText as non-null", async () => {
      const results = await searchPagesByIlike("XyzIntegrationMarker", 5);
      const match = results.find((r) => r.pageId === ID.page);
      expect(match).toBeDefined();
      expect(match?.pageId).toBe(ID.page);
      expect(match?.pageTitle).toBe("CamelCase検証ページ");
      expect(match?.chunkText).toContain("XyzIntegrationMarker");
      expect(match?.similarity).toBe(0.5);
    });
  });

  describe("getPageSpaceType", () => {
    it("returns spaceType as a non-null string", async () => {
      const result = await getPageSpaceType(ID.page);
      expect(result).not.toBeNull();
      expect(result?.spaceId).toBe(ID.space);
      expect(result?.spaceType).toBe("general");
    });
  });

  describe("listPagesOrderedByUpdatedAt", () => {
    it("returns authorName and spaceName as strings (not undefined from snake_case miss)", async () => {
      const pages = await listPagesOrderedByUpdatedAt();
      const match = pages.find((p) => p.id === ID.page);
      expect(match).toBeDefined();
      expect(match?.authorName).toBe("Integration Tester");
      expect(match?.spaceName).toBe("Integration Test Space");
    });
  });

  // ── auth-repository ──────────────────────────────────────────

  describe("findUserByEmailWithPasswordIdentity", () => {
    it("returns user and identity with all camelCase fields defined", async () => {
      const result = await findUserByEmailWithPasswordIdentity("camelcase-integration@test.local");
      expect(result).not.toBeNull();

      // user fields from snake_case aliases
      expect(result?.user.id).toBe(ID.user);
      expect(result?.user.deletedAt).toBeNull();
      expect(result?.user.createdAt).toBeInstanceOf(Date);
      expect(result?.user.updatedAt).toBeInstanceOf(Date);

      // identity fields from snake_case aliases
      expect(result?.identity.id).toBe(ID.identity);
      expect(result?.identity.userId).toBe(ID.user);
      expect(result?.identity.createdAt).toBeInstanceOf(Date);
      expect(result?.identity.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ── ai-chat-repository ───────────────────────────────────────

  describe("listConversations", () => {
    it("returns creatorName (not creator_name) as a string", async () => {
      const conversations = await listConversations({});
      const match = conversations.find((c) => c.id === ID.conversation);
      expect(match).toBeDefined();
      // The field is accessed as creatorName in the route handler
      expect((match as Record<string, unknown>).creatorName).toBe("Integration Tester");
    });
  });

  // ── meeting-realtime-repository ──────────────────────────────

  describe("listAutonomousActiveSessions", () => {
    it("returns session and agent with camelCase timestamp fields", async () => {
      const sessions = await listAutonomousActiveSessions();
      const match = sessions.find((s) => s.session.id === ID.session);
      expect(match).toBeDefined();

      // session fields from snake_case aliases
      expect(match?.session.joinedAt).toBeInstanceOf(Date);
      expect(match?.session.createdAt).toBeInstanceOf(Date);

      // agent fields from snake_case aliases
      expect(match?.agent.id).toBe(ID.agent);
      expect(match?.agent.createdAt).toBeInstanceOf(Date);
      expect(match?.agent.updatedAt).toBeInstanceOf(Date);
    });
  });
});
