CREATE TABLE "github_repos" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "name" text NOT NULL,
  "path_prefix" text NOT NULL DEFAULT '',
  "installation_id" bigint NOT NULL,
  "branch" text DEFAULT 'main' NOT NULL,
  "access_scope" text DEFAULT 'all_members' NOT NULL,
  "last_sync_at" timestamp,
  "sync_status" text DEFAULT 'idle' NOT NULL,
  "sync_error" text,
  "file_count" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "github_repos_unique" UNIQUE ("owner", "name", "path_prefix")
);

CREATE TABLE "github_files" (
  "id" text PRIMARY KEY NOT NULL,
  "repo_id" text NOT NULL REFERENCES "github_repos"("id") ON DELETE CASCADE,
  "path" text NOT NULL,
  "name" text NOT NULL,
  "sha" text NOT NULL,
  "plain_text" text,
  "size" integer,
  "last_modified_at" timestamp,
  "last_indexed_at" timestamp,
  "index_status" text DEFAULT 'pending' NOT NULL,
  "index_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "github_files_unique" UNIQUE ("repo_id", "path")
);
CREATE INDEX "github_files_repo_idx" ON "github_files" USING btree ("repo_id");
CREATE INDEX "github_files_status_idx" ON "github_files" USING btree ("index_status");

CREATE TABLE "github_embeddings" (
  "id" text PRIMARY KEY NOT NULL,
  "file_id" text NOT NULL REFERENCES "github_files"("id") ON DELETE CASCADE,
  "chunk_index" integer DEFAULT 0 NOT NULL,
  "plain_text" text NOT NULL,
  "embedding" vector NOT NULL,
  "model_id" text DEFAULT 'gemini-embedding-2-preview' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "github_embeddings_file_chunk_idx"
  ON "github_embeddings" USING btree ("file_id", "chunk_index");
