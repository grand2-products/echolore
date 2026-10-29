-- OAuth 2.1 (MCP client authorization) + agent token expiry
-- =================================================================
-- Adds:
--   - agent_tokens.expires_at: optional expiry for bearer tokens
--   - oauth_clients: dynamically registered MCP OAuth clients
--   - oauth_authorization_codes: single-use PKCE authorization codes
--   - oauth_refresh_tokens: rotating refresh tokens bound to agent tokens

ALTER TABLE "agent_tokens" ADD COLUMN "expires_at" timestamp;

CREATE TABLE "oauth_clients" (
  "id" text PRIMARY KEY NOT NULL,
  "client_name" text NOT NULL,
  "redirect_uris" text[] NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "oauth_authorization_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "code_hash" text NOT NULL,
  "client_id" text NOT NULL REFERENCES "oauth_clients"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "redirect_uri" text NOT NULL,
  "scopes" text[] NOT NULL,
  "code_challenge" text NOT NULL,
  "code_challenge_method" text DEFAULT 'S256' NOT NULL,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "oauth_authorization_codes_code_hash_idx" ON "oauth_authorization_codes" ("code_hash");

CREATE TABLE "oauth_refresh_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "agent_token_id" text NOT NULL REFERENCES "agent_tokens"("id") ON DELETE CASCADE,
  "client_id" text NOT NULL REFERENCES "oauth_clients"("id") ON DELETE CASCADE,
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "oauth_refresh_tokens_token_hash_idx" ON "oauth_refresh_tokens" ("token_hash");
