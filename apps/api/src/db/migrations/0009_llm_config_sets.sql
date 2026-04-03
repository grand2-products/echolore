-- LLM Config Sets: named provider configurations assignable per feature
-- =====================================================================

-- 1. Create llm_config_sets table
CREATE TABLE "llm_config_sets" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "provider" text DEFAULT 'google' NOT NULL,
  "gemini_api_key" text,
  "gemini_text_model" text,
  "vertex_project" text,
  "vertex_location" text,
  "vertex_model" text,
  "zhipu_api_key" text,
  "zhipu_text_model" text,
  "zhipu_use_coding_plan" boolean DEFAULT false NOT NULL,
  "openai_compat_base_url" text,
  "openai_compat_api_key" text,
  "openai_compat_model" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "llm_config_sets_name_idx" ON "llm_config_sets" ("name");

-- 2. Migrate existing global LLM settings into a "Default" config set
INSERT INTO "llm_config_sets" ("id", "name", "provider",
  "gemini_api_key", "gemini_text_model",
  "vertex_project", "vertex_location", "vertex_model",
  "zhipu_api_key", "zhipu_text_model", "zhipu_use_coding_plan",
  "openai_compat_base_url", "openai_compat_api_key", "openai_compat_model")
SELECT
  'default',
  'Default',
  COALESCE((SELECT value FROM site_settings WHERE key = 'llmProvider'), 'google'),
  (SELECT value FROM site_settings WHERE key = 'llmGeminiApiKey'),
  (SELECT value FROM site_settings WHERE key = 'llmGeminiTextModel'),
  (SELECT value FROM site_settings WHERE key = 'llmVertexProject'),
  (SELECT value FROM site_settings WHERE key = 'llmVertexLocation'),
  (SELECT value FROM site_settings WHERE key = 'llmVertexModel'),
  (SELECT value FROM site_settings WHERE key = 'llmZhipuApiKey'),
  (SELECT value FROM site_settings WHERE key = 'llmZhipuTextModel'),
  COALESCE((SELECT value FROM site_settings WHERE key = 'llmZhipuUseCodingPlan') = 'true', false),
  (SELECT value FROM site_settings WHERE key = 'llmOpenaiCompatBaseUrl'),
  (SELECT value FROM site_settings WHERE key = 'llmOpenaiCompatApiKey'),
  (SELECT value FROM site_settings WHERE key = 'llmOpenaiCompatModel')
WHERE NOT EXISTS (SELECT 1 FROM "llm_config_sets" WHERE "id" = 'default');

-- 3. Add feature-to-config-set assignment keys
INSERT INTO "site_settings" ("key", "value") VALUES ('llmConfigSetDefault', 'default') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "site_settings" ("key", "value") VALUES ('llmConfigSetAiChat', 'default') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "site_settings" ("key", "value") VALUES ('llmConfigSetAituber', 'default') ON CONFLICT ("key") DO NOTHING;

-- 4. Add llm_config_set_id column to agents with FK constraint
ALTER TABLE "agents" ADD COLUMN "llm_config_set_id" text
  REFERENCES "llm_config_sets"("id") ON DELETE SET NULL;
