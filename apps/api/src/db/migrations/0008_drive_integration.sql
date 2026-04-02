-- Google Drive integration: tables + relax page_embeddings vector dimension
-- ==========================================================================

-- 1. Relax page_embeddings.embedding from vector(768) to dimensionless vector
--    so the admin-configurable embedding dimensions (768/1536/3072) actually work.
ALTER TABLE "page_embeddings" ALTER COLUMN "embedding" TYPE vector;

-- 2. Drive files metadata
CREATE TABLE "drive_files" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "mime_type" text NOT NULL,
  "drive_id" text,
  "parent_folder_id" text,
  "web_view_link" text,
  "modified_at" timestamp,
  "content_hash" text,
  "last_indexed_at" timestamp,
  "index_status" text DEFAULT 'pending' NOT NULL,
  "index_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 3. Drive embeddings (mirrors page_embeddings structure, dimensionless vector)
CREATE TABLE "drive_embeddings" (
  "id" text PRIMARY KEY NOT NULL,
  "file_id" text NOT NULL REFERENCES "drive_files"("id") ON DELETE CASCADE,
  "chunk_index" integer DEFAULT 0 NOT NULL,
  "plain_text" text NOT NULL,
  "embedding" vector NOT NULL,
  "model_id" text DEFAULT 'gemini-embedding-2-preview' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "drive_embeddings_file_chunk_idx"
  ON "drive_embeddings" USING btree ("file_id", "chunk_index");

-- 4. Drive file permissions cache (for query-time access filtering)
CREATE TABLE "drive_file_permissions" (
  "id" text PRIMARY KEY NOT NULL,
  "file_id" text NOT NULL REFERENCES "drive_files"("id") ON DELETE CASCADE,
  "permission_type" text NOT NULL,
  "email" text,
  "domain" text,
  "role" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "drive_file_permissions_file_idx"
  ON "drive_file_permissions" USING btree ("file_id");
CREATE INDEX "drive_file_permissions_email_idx"
  ON "drive_file_permissions" USING btree ("email");
