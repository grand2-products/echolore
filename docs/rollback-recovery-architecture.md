# Rollback Recovery Architecture

Last updated: 2026-03-12

This document describes the current rollback and recovery shape for `corp-internal`.

## Primary Rollback Path
- standard rollback is workflow-driven through `App Rollback`
- rollback uses immutable `API_IMAGE` and `WEB_IMAGE` inputs
- host-side apply logic is shared through `scripts/release/remote-runtime-apply.sh`

## Runtime Recovery Model
- runtime `.env` is written per release
- previous runtime `.env` is preserved on host as rollback input
- runtime recovery reuses `docker compose pull` and `docker compose up -d --remove-orphans`

## Validation Model
- release validates API and web health after rollout
- rollback validates API and web health after recovery
- bootstrap validation exercises compose rendering and isolated startup without source tree

## Break-Glass Boundary
- SSH is break-glass only
- manual host edits do not replace the workflow path as the durable fix
- if break-glass recovery is used, operators should return to workflow-managed state immediately after stabilization

## Migration Rollback Strategy

Drizzle migrations are forward-only. The API runs pending migrations on startup
(`migrate()` in `db/index.ts`). Rolling back to an older image does **not** undo
schema changes.

### Additive migrations (safe to roll back)

Most migrations only add tables or columns. Rolling back the app image is safe
because the old code simply ignores the extra schema objects.

Examples of additive changes:
- `0008_meeting_recordings.sql` — adds `meeting_recordings` table. Old images
  never reference this table so rollback is seamless.

### Destructive migrations (require manual intervention)

If a migration drops a column, renames a table, or changes a column type, rolling
back to the previous image will fail because the old code expects the removed
schema.

**Before deploying a destructive migration:**

1. Write a companion rollback SQL script and commit it next to the migration
   (e.g., `0009_rollback.sql`).
2. Test the rollback script locally:
   ```bash
   docker compose exec db psql -U wiki -d wiki -f /path/to/rollback.sql
   ```
3. Document the rollback script path in the PR description and release notes.
4. After rollback, manually update `drizzle/__drizzle_migrations` to remove
   the rolled-back entry so the next deploy does not skip the re-applied
   migration.

### Emergency DB recovery

If a bad migration reaches production:

1. SSH to host (break-glass).
2. Stop the API: `docker compose stop api`
3. Take a backup: `docker compose exec db pg_dump -U wiki wiki > /tmp/backup_$(date +%s).sql`
4. Apply the rollback SQL.
5. Roll back the app image via `App Rollback` workflow.
6. Validate health.

## Known Limits
- clean-host bootstrap success still needs to be proven in both environments
- rollback still assumes image tags are known and available
- rollback runs forward-only DB migrations; destructive schema changes require the manual intervention described above
- no separate disaster-recovery topology is documented beyond single-host runtime recovery

## Related Files
- `./release-workflows.md`
- `./ops-runbook.md`
- `../DEPLOYMENT.md`
