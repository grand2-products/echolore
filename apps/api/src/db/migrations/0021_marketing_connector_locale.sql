-- Timezone and currency for ad and analytics connectors are read from the
-- account or property. Until that read succeeds they stay unset.
ALTER TABLE marketing_connectors ALTER COLUMN timezone DROP DEFAULT;
ALTER TABLE marketing_connectors ALTER COLUMN timezone DROP NOT NULL;
