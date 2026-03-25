terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # bootstrap.sh で作成したバケットを指定
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# =========================================================================
# API 有効化
# =========================================================================
locals {
  base_apis = [
    "storage.googleapis.com",
    "generativelanguage.googleapis.com",
    "iamcredentials.googleapis.com",
  ]
  vertex_apis = var.enable_vertex_ai ? ["aiplatform.googleapis.com"] : []
  speech_apis = var.enable_speech ? [
    "speech.googleapis.com",
    "texttospeech.googleapis.com",
  ] : []
  all_apis = concat(local.base_apis, local.vertex_apis, local.speech_apis)
}

resource "google_project_service" "apis" {
  for_each = toset(local.all_apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# =========================================================================
# サービスアカウント
# =========================================================================
resource "google_service_account" "echolore" {
  account_id   = "echolore"
  display_name = "EchoLore Application"
  description  = "EchoLore が GCP リソースにアクセスするためのサービスアカウント"
}

resource "google_service_account_key" "echolore" {
  service_account_id = google_service_account.echolore.name
}

# =========================================================================
# IAM ロール付与
# =========================================================================
locals {
  base_roles   = ["roles/storage.objectAdmin"]
  vertex_roles = var.enable_vertex_ai ? ["roles/aiplatform.user"] : []
  speech_roles = var.enable_speech ? ["roles/speech.client"] : []
  all_roles    = concat(local.base_roles, local.vertex_roles, local.speech_roles)
}

resource "google_project_iam_member" "echolore" {
  for_each = toset(local.all_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.echolore.email}"
}

# =========================================================================
# GCS バケット（ファイルストレージ用）
# =========================================================================
resource "google_storage_bucket" "files" {
  count = var.enable_gcs ? 1 : 0

  name     = var.gcs_bucket_name != "" ? var.gcs_bucket_name : "${var.project_id}-echolore-files"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  autoclass {
    enabled                = true
    terminal_storage_class = "ARCHIVE"
  }

  force_destroy = false
}
