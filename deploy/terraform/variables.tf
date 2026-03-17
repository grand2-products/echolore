variable "project_id" {
  description = "GCP プロジェクト ID"
  type        = string
}

variable "region" {
  description = "GCP リージョン"
  type        = string
  default     = "asia-northeast1"
}

variable "echolore_domain" {
  description = "EchoLore のドメイン名（OAuth リダイレクト URI に使用）"
  type        = string
}

# ---------------------------------------------------------------------------
# GCS ファイルストレージ
# ---------------------------------------------------------------------------
variable "enable_gcs" {
  description = "EchoLore 用の GCS バケットを作成するか"
  type        = bool
  default     = true
}

variable "gcs_bucket_name" {
  description = "ファイルストレージ用バケット名（グローバルに一意）"
  type        = string
  default     = ""
}

variable "gcs_storage_class" {
  description = "GCS ストレージクラス"
  type        = string
  default     = "STANDARD"
}

# ---------------------------------------------------------------------------
# Vertex AI
# ---------------------------------------------------------------------------
variable "enable_vertex_ai" {
  description = "Vertex AI API を有効化するか"
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------------
# Speech / TTS
# ---------------------------------------------------------------------------
variable "enable_speech" {
  description = "Speech-to-Text / Text-to-Speech API を有効化するか"
  type        = bool
  default     = true
}
