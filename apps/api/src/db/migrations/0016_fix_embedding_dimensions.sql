-- Fix embedding dimensions to 768 and add HNSW indexes for fast vector search.
-- Removes admin-configurable dimension switching (was 768/1536/3072).
-- Any existing embeddings with dimensions != 768 are purged and will be
-- regenerated on the next sync/edit cycle.

-- 1. Purge non-768 embeddings (if any)
DELETE FROM page_embeddings WHERE vector_dims(embedding::vector) != 768;
DELETE FROM drive_embeddings WHERE vector_dims(embedding::vector) != 768;
DELETE FROM github_embeddings WHERE vector_dims(embedding::vector) != 768;

-- 2. Fix column type to vector(768)
ALTER TABLE page_embeddings ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE drive_embeddings ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE github_embeddings ALTER COLUMN embedding TYPE vector(768);

-- 3. Add HNSW indexes for cosine distance
CREATE INDEX "page_embeddings_hnsw_idx"
  ON "page_embeddings" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "drive_embeddings_hnsw_idx"
  ON "drive_embeddings" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "github_embeddings_hnsw_idx"
  ON "github_embeddings" USING hnsw ("embedding" vector_cosine_ops);

-- 4. Remove stale dimension setting
DELETE FROM site_settings WHERE key = 'llmEmbeddingDimensions';
