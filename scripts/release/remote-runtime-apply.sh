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

if [[ -f /tmp/livekit.yaml ]]; then
  sudo mv /tmp/livekit.yaml "${RUNTIME_DIR}/livekit.yaml"
fi

sudo mv "${STAGED_ENV_PATH}" "${RUNTIME_DIR}/.env"
sudo chown -R "$USER:$USER" "${RUNTIME_DIR}"

cd "${RUNTIME_DIR}"

grep '^RELEASE_SHA=' .env >/dev/null
docker compose config >/dev/null
docker compose pull
docker compose up -d --remove-orphans
docker compose ps
curl --fail --retry 10 --retry-delay 5 http://localhost:3001/health
curl --fail --retry 10 --retry-delay 5 http://localhost:3000

