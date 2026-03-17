#!/usr/bin/env bash
# --------------------------------------------------------------------------
# Terraform state 用 GCS バケットを作成するブートストラップスクリプト
#
# 使い方:
#   ./bootstrap.sh <PROJECT_ID> [REGION]
#
# 前提:
#   - gcloud CLI がインストール済み
#   - gcloud auth login 済み
#   - 対象プロジェクトに対する Editor 以上の権限
# --------------------------------------------------------------------------
set -euo pipefail

PROJECT_ID="${1:?使い方: $0 <PROJECT_ID> [REGION]}"
REGION="${2:-asia-northeast1}"
BUCKET_NAME="${PROJECT_ID}-echolore-tfstate"

echo "==> プロジェクトを設定: ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}"

echo "==> Cloud Storage API を有効化"
gcloud services enable storage.googleapis.com

echo "==> Terraform state 用バケットを作成: gs://${BUCKET_NAME}"
if gcloud storage buckets describe "gs://${BUCKET_NAME}" &>/dev/null; then
  echo "    (既に存在します — スキップ)"
else
  gcloud storage buckets create "gs://${BUCKET_NAME}" \
    --location="${REGION}" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

echo "==> バージョニングを有効化（state の誤削除防止）"
gcloud storage buckets update "gs://${BUCKET_NAME}" --versioning

cat <<EOF

完了しました。以下のコマンドで Terraform を初期化してください:

  cd deploy/terraform
  cp terraform.tfvars.example terraform.tfvars
  # terraform.tfvars を編集

  terraform init \\
    -backend-config="bucket=${BUCKET_NAME}" \\
    -backend-config="prefix=terraform/state"

  terraform plan
  terraform apply

EOF
