#!/usr/bin/env bash
set -euo pipefail

# EchoLore update script
# Usage:
#   ./update.sh                    # update to latest
#   ./update.sh --version v0.2.0   # update to specific version

INSTALL_DIR="${ECHOLORE_INSTALL_DIR:-/opt/echolore}"
GITHUB_REPO="grand2-products/echolore"
TARGET_VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) TARGET_VERSION="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# ── helpers ──────────────────────────────────────────────────────────────────

info()  { printf '\033[1;34m[echolore]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[echolore]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[echolore]\033[0m %s\n' "$*" >&2; }
fail()  { printf '\033[1;31m[echolore]\033[0m %s\n' "$*" >&2; exit 1; }

# ── pre-flight ───────────────────────────────────────────────────────────────

[ -f "${INSTALL_DIR}/.env" ] || fail "No installation found at ${INSTALL_DIR}. Run install.sh first."
[ -f "${INSTALL_DIR}/docker-compose.yml" ] || fail "docker-compose.yml not found in ${INSTALL_DIR}."

cd "${INSTALL_DIR}"

# ── resolve version ──────────────────────────────────────────────────────────

if [ -z "$TARGET_VERSION" ]; then
  info "Fetching latest version from GitHub..."
  TARGET_VERSION=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | grep -oP '"tag_name":\s*"\K[^"]+') \
    || fail "Could not determine latest version. Specify --version explicitly."
fi

info "Updating to ${TARGET_VERSION}..."

# ── backup .env ──────────────────────────────────────────────────────────────

cp .env ".env.backup.$(date +%Y%m%d%H%M%S)"
info "Backed up .env"

# ── download updated compose ─────────────────────────────────────────────────

info "Downloading docker-compose.production.yml for ${TARGET_VERSION}..."
curl -fsSL "https://github.com/${GITHUB_REPO}/releases/download/${TARGET_VERSION}/docker-compose.production.yml" \
  -o docker-compose.yml.new
mv docker-compose.yml.new docker-compose.yml

# ── update version in .env ───────────────────────────────────────────────────

if grep -q '^ECHOLORE_VERSION=' .env; then
  sed -i "s/^ECHOLORE_VERSION=.*/ECHOLORE_VERSION=${TARGET_VERSION}/" .env
else
  echo "ECHOLORE_VERSION=${TARGET_VERSION}" >> .env
fi

# ── pull new images ──────────────────────────────────────────────────────────

info "Pulling images..."
docker compose pull

# ── run migrations ───────────────────────────────────────────────────────────

info "Running database migrations..."
docker compose run --rm api node dist/apps/api/src/db/migrate.js || warn "Migration command failed — check logs."

# ── restart services ─────────────────────────────────────────────────────────

info "Restarting services..."
docker compose up -d --remove-orphans

# ── health check ─────────────────────────────────────────────────────────────

info "Waiting for services to become healthy..."
TIMEOUT=120
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  if docker compose exec -T api wget --no-verbose --tries=1 --spider http://localhost:3001/health 2>/dev/null; then
    break
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  warn "Health check timed out. Check logs: docker compose logs"
else
  ok "Update to ${TARGET_VERSION} complete!"
fi
