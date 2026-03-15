#!/usr/bin/env bash
set -euo pipefail

# EchoLore install script
# Usage:
#   Interactive:   curl -fsSL <release-url>/install.sh | bash
#   Unattended:    DOMAIN=example.com ACME_EMAIL=admin@example.com ./install.sh --unattended

INSTALL_DIR="${ECHOLORE_INSTALL_DIR:-/opt/echolore}"
GITHUB_REPO="grand2-products/echolore"
COMPOSE_URL_BASE="https://github.com/${GITHUB_REPO}/releases"
UNATTENDED=false

for arg in "$@"; do
  case "$arg" in
    --unattended) UNATTENDED=true ;;
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
  read -r input
  eval "$varname=\${input:-\$current}"
}

# ── pre-flight checks ───────────────────────────────────────────────────────

info "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install Docker first: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required. Install the compose plugin: https://docs.docker.com/compose/install/"

info "Docker and Docker Compose v2 detected."

# ── idempotency check ───────────────────────────────────────────────────────

if [ -f "${INSTALL_DIR}/.env" ] && [ "$UNATTENDED" = false ]; then
  warn "An existing installation was found at ${INSTALL_DIR}."
  printf 'Overwrite? [y/N]: '
  read -r confirm
  case "$confirm" in
    [yY]*) ;;
    *) fail "Aborted." ;;
  esac
fi

# ── gather configuration ────────────────────────────────────────────────────

info "Configuring EchoLore..."

prompt_value DOMAIN       "Domain name (e.g. echolore.example.com)"
prompt_value ACME_EMAIL   "Email for Let's Encrypt certificates"

# auto-generate secrets (keep existing if set)
DB_PASSWORD="${DB_PASSWORD:-$(rand_secret 32)}"
AUTH_SECRET="${AUTH_SECRET:-$(rand_secret 48)}"
LIVEKIT_API_KEY="${LIVEKIT_API_KEY:-$(rand_secret 16)}"
LIVEKIT_API_SECRET="${LIVEKIT_API_SECRET:-$(rand_secret 32)}"
ROOM_AI_WORKER_SECRET="${ROOM_AI_WORKER_SECRET:-$(rand_secret 32)}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(rand_secret 32)}"

# derived values
CORS_ORIGIN="https://${DOMAIN}"
NEXT_PUBLIC_API_URL="https://${DOMAIN}"
NEXT_PUBLIC_LIVEKIT_URL="wss://${DOMAIN}"
LIVEKIT_TURN_DOMAIN="${LIVEKIT_TURN_DOMAIN:-${DOMAIN}}"

# version
ECHOLORE_VERSION="${ECHOLORE_VERSION:-latest}"

# ── resolve latest version if needed ─────────────────────────────────────────

if [ "$ECHOLORE_VERSION" = "latest" ] && command -v curl >/dev/null 2>&1; then
  RESOLVED_VERSION=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null | grep -oP '"tag_name":\s*"\K[^"]+' || echo "latest")
  if [ "$RESOLVED_VERSION" != "latest" ]; then
    ECHOLORE_VERSION="$RESOLVED_VERSION"
    info "Resolved latest version: ${ECHOLORE_VERSION}"
  fi
fi

# ── create install directory ─────────────────────────────────────────────────

info "Setting up ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"

# ── download compose file ────────────────────────────────────────────────────

info "Downloading docker-compose.production.yml..."
if [ "$ECHOLORE_VERSION" != "latest" ]; then
  COMPOSE_DOWNLOAD_URL="${COMPOSE_URL_BASE}/download/${ECHOLORE_VERSION}/docker-compose.production.yml"
else
  COMPOSE_DOWNLOAD_URL="${COMPOSE_URL_BASE}/latest/download/docker-compose.production.yml"
fi

curl -fsSL "${COMPOSE_DOWNLOAD_URL}" -o "${INSTALL_DIR}/docker-compose.yml" || {
  warn "Failed to download from release. Trying main branch..."
  curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/docker-compose.production.yml" -o "${INSTALL_DIR}/docker-compose.yml"
}

# ── generate .env ────────────────────────────────────────────────────────────

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

# ── run migrations ───────────────────────────────────────────────────────────

info "Running database migrations..."
docker compose run --rm api node dist/apps/api/src/db/migrate.js || warn "Migration command failed — the API may handle this on first start."

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
  warn "Health check timed out. Check logs with: cd ${INSTALL_DIR} && docker compose logs"
else
  ok "EchoLore is running!"
fi

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
