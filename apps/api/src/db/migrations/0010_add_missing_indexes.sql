-- Add missing indexes on frequently queried columns
-- ===================================================

-- blocks.page_id — used in all block queries (getPageBlocks, listBlockContentsByPageIds)
CREATE INDEX IF NOT EXISTS "blocks_page_id_idx"
  ON "blocks" USING btree ("page_id");--> statement-breakpoint

-- files.uploader_id — used in listFilesByUploader()
CREATE INDEX IF NOT EXISTS "files_uploader_id_idx"
  ON "files" USING btree ("uploader_id");--> statement-breakpoint

-- meeting_invites.token — used in token lookups (findValidInviteByToken, findInviteByToken)
CREATE INDEX IF NOT EXISTS "meeting_invites_token_idx"
  ON "meeting_invites" USING btree ("token");--> statement-breakpoint

-- meeting_transcript_segments: composite index for sorted listing by meeting
CREATE INDEX IF NOT EXISTS "meeting_transcript_segments_meeting_started_idx"
  ON "meeting_transcript_segments" USING btree ("meeting_id", "started_at");
