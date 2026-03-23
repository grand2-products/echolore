#!/usr/bin/env bash
set -euo pipefail

# EchoLore install script — first-time setup only
# Usage:
#   Interactive:   curl -fsSL <release-url>/install.sh | sudo bash
#   Unattended:    DOMAIN=example.com ACME_EMAIL=admin@example.com sudo -E ./install.sh --unattended
#   Re-initialize: sudo ./install.sh --force

INSTALL_DIR="${ECHOLORE_INSTALL_DIR:-/opt/echolore}"
GITHUB_REPO="grand2-products/echolore"
COMPOSE_URL_BASE="https://github.com/${GITHUB_REPO}/releases"
LOCK_FILE="${INSTALL_DIR}/.echolore.lock"
UNATTENDED=false
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --unattended) UNATTENDED=true ;;
    --force)      FORCE=true ;;
  esac
done

# ── helpers ──────────────────────────────────────────────────────────────────

info()  { printf '\033[1;34m[echolore]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[echolore]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[echolore]\033[0m %s\n' "$*" >&2; }
fail()  { printf '\033[1;31m[echolore]\033[0m %s\n' "$*" >&2; exit 1; }

rand_secret() { openssl rand -base64 "$1" | tr -d '\n'; }

prompt_value() {
  local varname="$1" prompt_text="$2" default="${3:-}"
  if [ "$UNATTENDED" = true ]; then
    eval "val=\${$varname:-$default}"
    if [ -z "$val" ]; then
      fail "In unattended mode, $varname must be set via environment variable."
    fi
    eval "$varname=\$val"
    return
  fi
  local current
  current="${!varname:-$default}"
  if [ -n "$current" ]; then
    printf '%s [%s]: ' "$prompt_text" "$current"
  else
    printf '%s: ' "$prompt_text"
  fi
  read -r input </dev/tty
  eval "$varname=\${input:-\$current}"
}

acquire_lock() {
  mkdir -p "${INSTALL_DIR}"
  exec 9>"${LOCK_FILE}"
  if ! flock -n 9; then
    fail "Another install/update is already running. If this is stale, remove ${LOCK_FILE}"
  fi
}

# ── pre-flight checks ───────────────────────────────────────────────────────

info "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install Docker first: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required. Install the compose plugin: https://docs.docker.com/compose/install/"

info "Docker and Docker Compose v2 detected."

# ── existing installation guard ──────────────────────────────────────────────

if [ -f "${INSTALL_DIR}/.env" ]; then
  if [ "$FORCE" = false ]; then
    fail "An existing installation was found at ${INSTALL_DIR}/.env. Use update.sh to update, or install.sh --force to re-initialize (secrets will be preserved)."
  fi

  # --force: load existing secrets to preserve them
  # shellcheck disable=SC1091
  set -a; . "${INSTALL_DIR}/.env"; set +a
  info "Loaded existing secrets from ${INSTALL_DIR}/.env (they will be preserved)."
fi

# ── lock ─────────────────────────────────────────────────────────────────────

acquire_lock

# ── gather configuration ────────────────────────────────────────────────────

info "Configuring EchoLore..."

prompt_value DOMAIN       "Domain name (e.g. echolore.example.com)"
prompt_value ACME_EMAIL   "Email for Let's Encrypt certificates"

# ── generate secrets (keep existing if loaded via --force) ───────────────────

DB_PASSWORD="${DB_PASSWORD:-$(rand_secret 32)}"
AUTH_SECRET="${AUTH_SECRET:-$(rand_secret 48)}"
LIVEKIT_API_KEY="${LIVEKIT_API_KEY:-$(rand_secret 16)}"
LIVEKIT_API_SECRET="${LIVEKIT_API_SECRET:-$(rand_secret 32)}"
ROOM_AI_WORKER_SECRET="${ROOM_AI_WORKER_SECRET:-$(rand_secret 32)}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(openssl rand -hex 32)}"

# ── derived values ──────────────────────────────────────────────────────────

CORS_ORIGIN="https://${DOMAIN}"
NEXT_PUBLIC_API_URL="https://${DOMAIN}"
NEXT_PUBLIC_LIVEKIT_URL="wss://${DOMAIN}"
LIVEKIT_TURN_DOMAIN="${LIVEKIT_TURN_DOMAIN:-${DOMAIN}}"

# ── resolve version ─────────────────────────────────────────────────────────

ECHOLORE_VERSION="${ECHOLORE_VERSION:-latest}"

if [ "$ECHOLORE_VERSION" = "latest" ] && command -v curl >/dev/null 2>&1; then
  RESOLVED_VERSION=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null | grep -oP '"tag_name":\s*"\K[^"]+' || echo "latest")
  if [ "$RESOLVED_VERSION" != "latest" ]; then
    ECHOLORE_VERSION="$RESOLVED_VERSION"
    info "Resolved latest version: ${ECHOLORE_VERSION}"
  fi
fi

# ── download compose file ────────────────────────────────────────────────────

info "Downloading docker-compose.production.yml..."
if [ "$ECHOLORE_VERSION" != "latest" ]; then
  COMPOSE_DOWNLOAD_URL="${COMPOSE_URL_BASE}/download/${ECHOLORE_VERSION}/docker-compose.production.yml"
else
  COMPOSE_DOWNLOAD_URL="${COMPOSE_URL_BASE}/latest/download/docker-compose.production.yml"
fi

curl -fsSL "${COMPOSE_DOWNLOAD_URL}" -o "${INSTALL_DIR}/docker-compose.yml.new" || {
  warn "Failed to download from release. Trying main branch..."
  curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/docker-compose.production.yml" -o "${INSTALL_DIR}/docker-compose.yml.new"
}

# validate compose file
if ! docker compose -f "${INSTALL_DIR}/docker-compose.yml.new" config -q 2>/dev/null; then
  rm -f "${INSTALL_DIR}/docker-compose.yml.new"
  fail "Downloaded compose file is invalid. Aborting."
fi

mv "${INSTALL_DIR}/docker-compose.yml.new" "${INSTALL_DIR}/docker-compose.yml"

# ── write .env ───────────────────────────────────────────────────────────────

info "Writing .env..."
cat > "${INSTALL_DIR}/.env" <<ENVEOF
# EchoLore configuration — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
ECHOLORE_VERSION=${ECHOLORE_VERSION}

DOMAIN=${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}

DB_PASSWORD=${DB_PASSWORD}
AUTH_SECRET=${AUTH_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
LIVEKIT_TURN_DOMAIN=${LIVEKIT_TURN_DOMAIN}

CORS_ORIGIN=${CORS_ORIGIN}
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
NEXT_PUBLIC_LIVEKIT_URL=${NEXT_PUBLIC_LIVEKIT_URL}

ROOM_AI_WORKER_SECRET=${ROOM_AI_WORKER_SECRET}
ENVEOF

chmod 600 "${INSTALL_DIR}/.env"

# ── pull and start ───────────────────────────────────────────────────────────

info "Pulling images..."
cd "${INSTALL_DIR}"
docker compose pull

info "Starting EchoLore..."
docker compose up -d

# ── health check (migrations run automatically on API startup) ─────────────────────────────────────────────────────────────

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
  warn "Health check timed out. Check logs with: cd ${INSTALL_DIR} && docker compose logs"
else
  ok "EchoLore is running!"
fi

# ── server auto-recovery ────────────────────────────────────────────────────

systemctl enable docker 2>/dev/null || true

echo ""
ok "Installation complete."
echo ""
echo "  URL:     https://${DOMAIN}"
echo "  Config:  ${INSTALL_DIR}/.env"
echo "  Logs:    cd ${INSTALL_DIR} && docker compose logs -f"
echo ""
echo "  Register the first user at https://${DOMAIN}/login"
echo "  The first user will automatically become admin."
echo ""
echo "  To update later:  curl -fsSL https://github.com/${GITHUB_REPO}/releases/latest/download/update.sh | sudo bash"
echo ""
