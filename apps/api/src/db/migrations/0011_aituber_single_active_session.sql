-- Ensure only one active AITuber session (status = 'created' or 'live') exists at a time.
-- This partial unique index prevents race conditions in the check-then-insert pattern.
CREATE UNIQUE INDEX "aituber_sessions_single_active"
  ON "aituber_sessions" ((true))
  WHERE "status" IN ('created', 'live');
