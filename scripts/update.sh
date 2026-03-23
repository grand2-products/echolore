#!/usr/bin/env bash
set -euo pipefail

# EchoLore update script — idempotent, with rollback on failure
# Usage:
#   ./update.sh                    # update to latest
#   ./update.sh --version v0.2.0   # update to specific version
#   ./update.sh --force            # re-deploy even if already at target version

INSTALL_DIR="${ECHOLORE_INSTALL_DIR:-/opt/echolore}"
GITHUB_REPO="grand2-products/echolore"
LOCK_FILE="${INSTALL_DIR}/.echolore.lock"
TARGET_VERSION=""
FORCE=false
CURRENT_VERSION="unknown"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) TARGET_VERSION="$2"; shift 2 ;;
    --force)   FORCE=true; shift ;;
    *)         shift ;;
  esac
done

# ── helpers ──────────────────────────────────────────────────────────────────

info()  { printf '\033[1;34m[echolore]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[echolore]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[echolore]\033[0m %s\n' "$*" >&2; }
fail()  { printf '\033[1;31m[echolore]\033[0m %s\n' "$*" >&2; exit 1; }

acquire_lock() {
  exec 9>"${LOCK_FILE}"
  if ! flock -n 9; then
    fail "Another install/update is already running. If this is stale, remove ${LOCK_FILE}"
  fi
}

health_check() {
  local timeout="${1:-120}" elapsed=0
  while [ $elapsed -lt "$timeout" ]; do
    if docker compose exec -T api wget --no-verbose --tries=1 --spider http://localhost:3001/health 2>/dev/null; then
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  return 1
}

rollback() {
  warn "Rolling back to previous version (${CURRENT_VERSION})..."

  if [ -f docker-compose.yml.prev ]; then
    mv docker-compose.yml.prev docker-compose.yml
  fi

  if [ "$CURRENT_VERSION" != "unknown" ]; then
    sed -i "s/^ECHOLORE_VERSION=.*/ECHOLORE_VERSION=${CURRENT_VERSION}/" .env
  fi

  docker compose pull 2>/dev/null || true
  docker compose up -d --remove-orphans 2>/dev/null || true

  fail "Update failed and was rolled back to ${CURRENT_VERSION}. Check logs: cd ${INSTALL_DIR} && docker compose logs"
}

# ── pre-flight ───────────────────────────────────────────────────────────────

[ -f "${INSTALL_DIR}/.env" ] || fail "No installation found at ${INSTALL_DIR}. Run install.sh first."
[ -f "${INSTALL_DIR}/docker-compose.yml" ] || fail "docker-compose.yml not found in ${INSTALL_DIR}."

command -v docker >/dev/null 2>&1 || fail "Docker is not installed."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."

cd "${INSTALL_DIR}"

# ── lock ─────────────────────────────────────────────────────────────────────

acquire_lock

# ── load current state ───────────────────────────────────────────────────────

# shellcheck disable=SC1091
set -a; . .env; set +a
CURRENT_VERSION="${ECHOLORE_VERSION:-unknown}"

# ── resolve target version ───────────────────────────────────────────────────

if [ -z "$TARGET_VERSION" ]; then
  info "Fetching latest version from GitHub..."
  TARGET_VERSION=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | grep -oP '"tag_name":\s*"\K[^"]+') \
    || fail "Could not determine latest version. Specify --version explicitly."
fi

# ── version check (idempotent skip) ──────────────────────────────────────────

if [ "$CURRENT_VERSION" = "$TARGET_VERSION" ] && [ "$FORCE" = false ]; then
  ok "Already at version ${TARGET_VERSION}. Nothing to do. Use --force to re-deploy."
  exit 0
fi

info "Updating ${CURRENT_VERSION} → ${TARGET_VERSION}..."

# ── backup ───────────────────────────────────────────────────────────────────

BACKUP_SUFFIX="$(date +%Y%m%d%H%M%S)"
cp .env ".env.backup.${BACKUP_SUFFIX}"
chmod 600 ".env.backup.${BACKUP_SUFFIX}"
cp docker-compose.yml docker-compose.yml.prev
info "Backed up .env and docker-compose.yml"

# clean up old backups (keep last 5)
# shellcheck disable=SC2012
ls -1t .env.backup.* 2>/dev/null | tail -n +6 | xargs -r rm -f

# ── download new compose ─────────────────────────────────────────────────────

info "Downloading docker-compose.production.yml for ${TARGET_VERSION}..."
curl -fsSL "https://github.com/${GITHUB_REPO}/releases/download/${TARGET_VERSION}/docker-compose.production.yml" \
  -o docker-compose.yml.new \
  || fail "Failed to download compose file for ${TARGET_VERSION}."

# validate compose file
if ! docker compose -f docker-compose.yml.new config -q 2>/dev/null; then
  rm -f docker-compose.yml.new
  fail "Downloaded compose file is invalid. Aborting (no changes made)."
fi

mv docker-compose.yml.new docker-compose.yml

# ── update version in .env ───────────────────────────────────────────────────

if grep -q '^ECHOLORE_VERSION=' .env; then
  sed -i "s/^ECHOLORE_VERSION=.*/ECHOLORE_VERSION=${TARGET_VERSION}/" .env
else
  echo "ECHOLORE_VERSION=${TARGET_VERSION}" >> .env
fi

# ── pull new images ──────────────────────────────────────────────────────────

info "Pulling images..."
docker compose pull || rollback

# ── restart services (migrations run automatically on API startup) ────────────

info "Restarting services..."
docker compose up -d --remove-orphans

# ── health check ─────────────────────────────────────────────────────────────

info "Waiting for services to become healthy..."
if ! health_check 120; then
  rollback
fi

# ── cleanup ──────────────────────────────────────────────────────────────────

rm -f docker-compose.yml.prev

echo ""
ok "Update complete: ${CURRENT_VERSION} → ${TARGET_VERSION}"
echo ""
echo "  Logs:  cd ${INSTALL_DIR} && docker compose logs -f"
echo ""
