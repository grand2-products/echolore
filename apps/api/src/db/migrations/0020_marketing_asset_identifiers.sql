BEGIN;
ALTER TABLE marketing_assets
  ADD COLUMN IF NOT EXISTS identifiers jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE marketing_assets
  ADD COLUMN IF NOT EXISTS legacy_identifiers_mapped boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_assets_identifiers_object'
  ) THEN
    ALTER TABLE marketing_assets
      ADD CONSTRAINT marketing_assets_identifiers_object
      CHECK (jsonb_typeof(identifiers) = 'object');
  END IF;
END $$;
COMMIT;
