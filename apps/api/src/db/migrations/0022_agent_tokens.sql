-- Agent tokens: bearer credentials for external AI agents (MCP)
-- ===============================================================

CREATE TABLE "agent_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "token_hash" text NOT NULL,
  "scopes" text[] DEFAULT '{read}' NOT NULL,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "agent_tokens_token_hash_idx" ON "agent_tokens" ("token_hash");
