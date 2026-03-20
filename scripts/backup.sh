#!/usr/bin/env bash
# EchoLore — Daily backup script
#
# Backs up: PostgreSQL, uploaded files, .env
# Retention: 14 days (local), offsite via GCS if configured
#
# Usage:
#   /opt/echolore/scripts/backup.sh            # Normal run
#   /opt/echolore/scripts/backup.sh --dry-run   # Show what would be done
#
# cron (recommended):
#   0 3 * * * root /opt/echolore/scripts/backup.sh >> /var/log/echolore-backup.log 2>&1

set -euo pipefail

INSTALL_DIR="${ECHOLORE_DIR:-/opt/echolore}"
BACKUP_DIR="${ECHOLORE_BACKUP_DIR:-${INSTALL_DIR}/backups}"
RETENTION_DAYS=14
DATE=$(date -u +%Y%m%d-%H%M%S)
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "[backup] dry-run mode"
fi

log() { echo "[backup] $(date -u +%H:%M:%S) $*"; }

mkdir -p "$BACKUP_DIR"

# ---------------------------------------------------------------------------
# 1. PostgreSQL (custom format, compressed)
# ---------------------------------------------------------------------------
DB_DUMP="$BACKUP_DIR/db-$DATE.dump"
log "Dumping PostgreSQL..."
if [[ "$DRY_RUN" == "false" ]]; then
  docker compose -f "$INSTALL_DIR/docker-compose.production.yml" \
    exec -T db pg_dump -U wiki -Fc wiki > "$DB_DUMP"
  log "DB dump: $DB_DUMP ($(du -h "$DB_DUMP" | cut -f1))"
else
  log "Would create: $DB_DUMP"
fi

# ---------------------------------------------------------------------------
# 2. Uploaded files (Docker named volume → tar.gz)
# ---------------------------------------------------------------------------
FILES_ARCHIVE="$BACKUP_DIR/files-$DATE.tar.gz"
log "Archiving file storage..."
if [[ "$DRY_RUN" == "false" ]]; then
  docker run --rm \
    -v echolore_file_data:/data:ro \
    -v "$BACKUP_DIR":/backup \
    alpine tar czf "/backup/files-$DATE.tar.gz" -C /data .
  log "Files archive: $FILES_ARCHIVE ($(du -h "$FILES_ARCHIVE" | cut -f1))"
else
  log "Would create: $FILES_ARCHIVE"
fi

# ---------------------------------------------------------------------------
# 3. Environment config snapshot
# ---------------------------------------------------------------------------
ENV_SNAP="$BACKUP_DIR/env-$DATE"
log "Snapshotting .env..."
if [[ "$DRY_RUN" == "false" ]]; then
  cp "$INSTALL_DIR/.env" "$ENV_SNAP"
  chmod 600 "$ENV_SNAP"
  log "Env snapshot: $ENV_SNAP"
else
  log "Would create: $ENV_SNAP"
fi

# ---------------------------------------------------------------------------
# 4. Retention — delete local backups older than RETENTION_DAYS
# ---------------------------------------------------------------------------
log "Cleaning backups older than ${RETENTION_DAYS} days..."
if [[ "$DRY_RUN" == "false" ]]; then
  find "$BACKUP_DIR" -name 'db-*.dump' -mtime +$RETENTION_DAYS -delete -print | while read -r f; do log "Deleted: $f"; done
  find "$BACKUP_DIR" -name 'files-*.tar.gz' -mtime +$RETENTION_DAYS -delete -print | while read -r f; do log "Deleted: $f"; done
  find "$BACKUP_DIR" -name 'env-*' -mtime +$RETENTION_DAYS -delete -print | while read -r f; do log "Deleted: $f"; done
else
  find "$BACKUP_DIR" -name 'db-*.dump' -mtime +$RETENTION_DAYS -print | while read -r f; do log "Would delete: $f"; done
fi

# ---------------------------------------------------------------------------
# 5. Offsite transfer (GCS) — optional, skip if gcloud not available
# ---------------------------------------------------------------------------
BACKUP_BUCKET="${ECHOLORE_BACKUP_BUCKET:-}"

if [[ -n "$BACKUP_BUCKET" ]] && command -v gcloud &>/dev/null; then
  log "Uploading to GCS: $BACKUP_BUCKET ..."
  if [[ "$DRY_RUN" == "false" ]]; then
    gcloud storage cp "$DB_DUMP" "$BACKUP_BUCKET/db/db-$DATE.dump"
    gcloud storage cp "$FILES_ARCHIVE" "$BACKUP_BUCKET/files/files-$DATE.tar.gz"
    # .env is NOT uploaded to cloud — contains secrets. Keep local + password manager only.
    log "GCS upload complete"
  else
    log "Would upload: $DB_DUMP → $BACKUP_BUCKET/db/"
    log "Would upload: $FILES_ARCHIVE → $BACKUP_BUCKET/files/"
  fi
elif [[ -n "$BACKUP_BUCKET" ]]; then
  log "WARNING: ECHOLORE_BACKUP_BUCKET set but gcloud CLI not found — skipping offsite"
fi

log "Backup completed: $DATE"
