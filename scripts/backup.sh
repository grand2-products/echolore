#!/usr/bin/env bash
# EchoLore — Backup trigger (calls the API-driven backup endpoint)
#
# Backup execution is now handled by the API server.
# This script is a thin wrapper for backward compatibility with existing cron jobs.
#
# Required env:
#   BACKUP_API_URL    — API base URL (default: http://localhost:3001)
#   BACKUP_API_TOKEN  — Admin Bearer token for authentication
#
# Usage:
#   /opt/echolore/scripts/backup.sh
#
# cron (recommended):
#   0 3 * * * root /opt/echolore/scripts/backup.sh >> /var/log/echolore-backup.log 2>&1

set -euo pipefail

BACKUP_API_URL="${BACKUP_API_URL:-http://localhost:3001}"
BACKUP_API_TOKEN="${BACKUP_API_TOKEN:-}"

if [[ -z "$BACKUP_API_TOKEN" ]]; then
  echo "[backup] ERROR: BACKUP_API_TOKEN is not set"
  exit 1
fi

echo "[backup] $(date -u +%H:%M:%S) Triggering backup via API..."

HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' \
  -X POST "${BACKUP_API_URL}/api/admin/backups/run" \
  -H "Authorization: Bearer ${BACKUP_API_TOKEN}" \
  -H "Content-Type: application/json")

if [[ "$HTTP_CODE" == "202" ]]; then
  echo "[backup] $(date -u +%H:%M:%S) Backup started (HTTP 202)"
elif [[ "$HTTP_CODE" == "409" ]]; then
  echo "[backup] $(date -u +%H:%M:%S) Backup already in progress (HTTP 409)"
else
  echo "[backup] $(date -u +%H:%M:%S) ERROR: Unexpected response (HTTP $HTTP_CODE)"
  exit 1
fi
