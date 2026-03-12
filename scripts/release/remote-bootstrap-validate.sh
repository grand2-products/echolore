#!/usr/bin/env bash
set -euo pipefail

RUN_ID="${1:?run id is required}"
STAGED_ENV_PATH="${2:?staged env path is required}"
VALIDATION_DIR="/tmp/bootstrap-validate-${RUN_ID}"
COMPOSE_PROJECT="bootstrap-validate-${RUN_ID}"
COMPOSE_FILE="docker-compose.bootstrap-check.yml"

if [[ ! -f /tmp/${COMPOSE_FILE} ]]; then
  echo "missing staged compose file: /tmp/${COMPOSE_FILE}" >&2
  exit 1
fi

if [[ ! -f "${STAGED_ENV_PATH}" ]]; then
  echo "missing staged env file: ${STAGED_ENV_PATH}" >&2
  exit 1
fi

cleanup() {
  cd "${VALIDATION_DIR}" 2>/dev/null || return 0
  docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" down -v --remove-orphans || true
  rm -rf "${VALIDATION_DIR}"
}

trap cleanup EXIT

mkdir -p "${VALIDATION_DIR}"
mv "/tmp/${COMPOSE_FILE}" "${VALIDATION_DIR}/${COMPOSE_FILE}"
mv "${STAGED_ENV_PATH}" "${VALIDATION_DIR}/.env"

cd "${VALIDATION_DIR}"

docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" config >/dev/null
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" pull
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" up -d --wait --remove-orphans
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" ps
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" exec -T api wget --no-verbose --tries=1 --spider http://localhost:3001/health
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" exec -T web wget --no-verbose --tries=1 --spider http://127.0.0.1:3000
