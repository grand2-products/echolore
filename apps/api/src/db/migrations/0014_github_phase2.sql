CREATE TABLE "github_repo_permissions" (
  "id" text PRIMARY KEY NOT NULL,
  "repo_id" text NOT NULL REFERENCES "github_repos"("id") ON DELETE CASCADE,
  "group_id" text NOT NULL REFERENCES "user_groups"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "github_repo_permissions_unique" UNIQUE ("repo_id", "group_id")
);
CREATE INDEX "github_repo_permissions_repo_idx" ON "github_repo_permissions" USING btree ("repo_id");
CREATE INDEX "github_repo_permissions_group_idx" ON "github_repo_permissions" USING btree ("group_id");

CREATE TABLE "github_sync_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "repo_id" text NOT NULL REFERENCES "github_repos"("id") ON DELETE CASCADE,
  "trigger" text NOT NULL,
  "status" text NOT NULL,
  "files_processed" integer DEFAULT 0,
  "files_added" integer DEFAULT 0,
  "files_updated" integer DEFAULT 0,
  "files_removed" integer DEFAULT 0,
  "error_message" text,
  "started_at" timestamp NOT NULL,
  "finished_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "github_sync_logs_repo_idx" ON "github_sync_logs" USING btree ("repo_id");
CREATE INDEX "github_sync_logs_created_idx" ON "github_sync_logs" USING btree ("created_at");

ALTER TABLE "github_repos" ADD COLUMN "file_extensions" text[] DEFAULT '{"md","mdx"}';
