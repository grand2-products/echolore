#!/usr/bin/env bash
set -euo pipefail

STAGED_ENV_PATH="${1:?staged env path is required}"
RUNTIME_DIR="${2:-/opt/wiki}"

if [[ ! -f "${STAGED_ENV_PATH}" ]]; then
  echo "staged env file not found: ${STAGED_ENV_PATH}" >&2
  exit 1
fi

sudo mkdir -p "${RUNTIME_DIR}"

if [[ -f "${RUNTIME_DIR}/.env" ]]; then
  sudo cp "${RUNTIME_DIR}/.env" "${RUNTIME_DIR}/.env.previous"
fi

if [[ -f /tmp/docker-compose.yml ]]; then
  sudo mv /tmp/docker-compose.yml "${RUNTIME_DIR}/docker-compose.yml"
fi

sudo mv "${STAGED_ENV_PATH}" "${RUNTIME_DIR}/.env"
sudo chown -R "$USER:$USER" "${RUNTIME_DIR}"

cd "${RUNTIME_DIR}"

grep '^RELEASE_SHA=' .env >/dev/null
docker compose config >/dev/null

# Authenticate to GHCR if credentials are available
if grep -q '^GHCR_TOKEN=' .env 2>/dev/null; then
  GHCR_TOKEN=$(grep '^GHCR_TOKEN=' .env | cut -d= -f2-)
  GHCR_USER=$(grep '^GHCR_USER=' .env | cut -d= -f2- || echo "")
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USER:-deploy}" --password-stdin
fi

docker compose pull

# Start DB first and run migrations before bringing up the full stack
docker compose up -d db
echo "Waiting for database to become healthy..."
until docker compose exec -T db pg_isready -U wiki -d wiki >/dev/null 2>&1; do
  sleep 2
done

echo "Running database migrations..."
docker compose run --rm -T --no-deps api node dist/apps/api/src/db/migrate.js

docker compose up -d --remove-orphans
docker compose ps
curl --fail --retry 10 --retry-delay 5 http://localhost:3001/health
docker compose exec -T web wget --no-verbose --tries=1 --spider http://127.0.0.1:3000
