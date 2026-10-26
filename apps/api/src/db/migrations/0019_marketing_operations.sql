-- Marketing operations: asset register, connectors, daily metrics,
-- dashboards, change approval, knowledge governance, reconciliation.

CREATE TABLE "marketing_assets" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "name" text NOT NULL,
  "external_id" text,
  "purpose" text,
  "owner_entity" text,
  "billing_entity" text,
  "primary_owner_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "secondary_owner_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "agency_name" text,
  "agency_relationship" text,
  "related_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "measurement_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "console_url" text,
  "public_url" text,
  "secret_reference" text,
  "emergency_contact" text,
  "wiki_page_id" text REFERENCES "pages"("id") ON DELETE SET NULL,
  "notes" text,
  "status" text DEFAULT 'active' NOT NULL,
  "verification_interval_days" integer DEFAULT 30 NOT NULL,
  "last_verified_at" timestamp,
  "last_verified_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "marketing_assets_type_idx" ON "marketing_assets" USING btree ("type");

CREATE TABLE "marketing_asset_access" (
  "id" text PRIMARY KEY NOT NULL,
  "asset_id" text NOT NULL REFERENCES "marketing_assets"("id") ON DELETE CASCADE,
  "principal" text NOT NULL,
  "principal_type" text NOT NULL,
  "role" text NOT NULL,
  "scope" text,
  "approved_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "marketing_asset_access_asset_idx" ON "marketing_asset_access" USING btree ("asset_id");

CREATE TABLE "marketing_connectors" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "asset_id" text REFERENCES "marketing_assets"("id") ON DELETE SET NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "secrets_enc" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "sync_interval_hours" integer DEFAULT 24 NOT NULL,
  "lookback_days" integer DEFAULT 7 NOT NULL,
  "timezone" text DEFAULT 'Asia/Tokyo' NOT NULL,
  "currency" text,
  "last_run_at" timestamp,
  "last_success_at" timestamp,
  "last_status" text,
  "last_error" text,
  "run_lock_until" timestamp,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "marketing_sync_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "connector_id" text NOT NULL REFERENCES "marketing_connectors"("id") ON DELETE CASCADE,
  "trigger" text NOT NULL,
  "status" text NOT NULL,
  "range_from" text NOT NULL,
  "range_to" text NOT NULL,
  "rows_fetched" integer DEFAULT 0 NOT NULL,
  "rows_written" integer DEFAULT 0 NOT NULL,
  "quality" jsonb,
  "error_message" text,
  "triggered_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "started_at" timestamp NOT NULL,
  "finished_at" timestamp
);
CREATE INDEX "marketing_sync_runs_connector_idx"
  ON "marketing_sync_runs" USING btree ("connector_id", "started_at" DESC);

-- Narrow daily fact table. Dimensions default to '' so the natural key is unique.
-- Rate metrics (CTR, CPA, ...) are never stored; they are computed from sums.
CREATE TABLE "marketing_metrics_daily" (
  "connector_id" text NOT NULL REFERENCES "marketing_connectors"("id") ON DELETE CASCADE,
  "date" text NOT NULL CHECK ("date" ~ '^\d{4}-\d{2}-\d{2}$'),
  "source" text NOT NULL,
  "account_id" text DEFAULT '' NOT NULL,
  "campaign_id" text DEFAULT '' NOT NULL,
  "campaign_name" text,
  "segment" text DEFAULT '' NOT NULL,
  "metric" text NOT NULL,
  "value" double precision NOT NULL,
  "currency" text,
  "fetched_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("connector_id", "date", "account_id", "campaign_id", "segment", "metric")
);
CREATE INDEX "marketing_metrics_daily_date_idx"
  ON "marketing_metrics_daily" USING btree ("date", "metric");

-- Dates successfully fetched per connector. Distinguishes "zero" from "未取得"
-- and is retained with the metrics (independent of run-log retention).
CREATE TABLE "marketing_metric_coverage" (
  "connector_id" text NOT NULL REFERENCES "marketing_connectors"("id") ON DELETE CASCADE,
  "date" text NOT NULL,
  "run_id" text,
  "fetched_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("connector_id", "date")
);

CREATE TABLE "marketing_dashboards" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "wiki_page_id" text REFERENCES "pages"("id") ON DELETE SET NULL,
  "default_range" text DEFAULT 'last_28_days' NOT NULL,
  "widgets" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "marketing_dashboard_revisions" (
  "id" text PRIMARY KEY NOT NULL,
  "dashboard_id" text NOT NULL REFERENCES "marketing_dashboards"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "definition" jsonb NOT NULL,
  "change_note" text NOT NULL,
  "author_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "marketing_dashboard_revisions_unique" UNIQUE ("dashboard_id", "version")
);

CREATE TABLE "marketing_change_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "purpose" text,
  "asset_id" text REFERENCES "marketing_assets"("id") ON DELETE SET NULL,
  "severity" text,
  "before_state" text,
  "after_state" text,
  "impact" text,
  "rollback_plan" text,
  "scheduled_at" timestamp,
  "status" text DEFAULT 'open' NOT NULL,
  "requested_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamp,
  "implemented_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "implemented_at" timestamp,
  "verified_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp,
  "verification_note" text,
  "evidence_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "wiki_page_id" text REFERENCES "pages"("id") ON DELETE SET NULL,
  "post_review_due_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "marketing_change_requests_status_idx"
  ON "marketing_change_requests" USING btree ("status");

CREATE TABLE "marketing_change_events" (
  "id" text PRIMARY KEY NOT NULL,
  "change_id" text NOT NULL REFERENCES "marketing_change_requests"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "actor_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "comment" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "marketing_change_events_change_idx"
  ON "marketing_change_events" USING btree ("change_id", "created_at");

CREATE TABLE "marketing_knowledge_pages" (
  "id" text PRIMARY KEY NOT NULL,
  "page_id" text NOT NULL UNIQUE REFERENCES "pages"("id") ON DELETE CASCADE,
  "layer" text NOT NULL,
  "doc_type" text DEFAULT 'general' NOT NULL,
  "purpose" text,
  "scope" text,
  "owner_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "deputy_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "review_interval_days" integer DEFAULT 90 NOT NULL,
  "last_reviewed_at" timestamp,
  "next_review_at" timestamp,
  "approved_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamp,
  "replaced_by_page_id" text REFERENCES "pages"("id") ON DELETE SET NULL,
  "related_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "marketing_reconciliations" (
  "id" text PRIMARY KEY NOT NULL,
  "connector_id" text NOT NULL REFERENCES "marketing_connectors"("id") ON DELETE CASCADE,
  "metric" text NOT NULL,
  "period_from" text NOT NULL,
  "period_to" text NOT NULL,
  "system_value" double precision NOT NULL,
  "source_value" double precision NOT NULL,
  "tolerance_pct" double precision DEFAULT 1 NOT NULL,
  "explanation" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "review_comment" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
