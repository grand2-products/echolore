#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <dev|prod> <init|plan|apply|destroy|validate> [extra terraform args...]"
  exit 1
fi

ENV_NAME="$1"
ACTION="$2"
shift 2

if [[ "$ENV_NAME" != "dev" && "$ENV_NAME" != "prod" ]]; then
  echo "Environment must be one of: dev, prod"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_DIR="$ROOT_DIR/environments/$ENV_NAME"
BACKEND_FILE="$ENV_DIR/backend.hcl"

if [[ ! -d "$ENV_DIR" ]]; then
  echo "Environment directory not found: $ENV_DIR"
  exit 1
fi

cd "$ENV_DIR"

case "$ACTION" in
  init)
    if [[ -f "$BACKEND_FILE" ]]; then
      terraform init -backend-config="$BACKEND_FILE" "$@"
    else
      echo "backend.hcl not found at $BACKEND_FILE"
      echo "Copy backend.hcl.example to backend.hcl and set bucket/prefix."
      exit 1
    fi
    ;;
  validate)
    terraform init -backend=false
    terraform validate "$@"
    ;;
  plan|apply|destroy)
    if [[ -f "$BACKEND_FILE" ]]; then
      terraform init -backend-config="$BACKEND_FILE"
    else
      echo "backend.hcl not found at $BACKEND_FILE"
      echo "Copy backend.hcl.example to backend.hcl and set bucket/prefix."
      exit 1
    fi
    terraform "$ACTION" "$@"
    ;;
  *)
    echo "Unsupported action: $ACTION"
    echo "Allowed: init, plan, apply, destroy, validate"
    exit 1
    ;;
esac
