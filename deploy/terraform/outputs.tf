output "service_account_email" {
  description = "EchoLore サービスアカウントのメールアドレス"
  value       = google_service_account.echolore.email
}

output "service_account_key_json" {
  description = "EchoLore 管理画面に貼り付けるサービスアカウントキー JSON"
  value       = base64decode(google_service_account_key.echolore.private_key)
  sensitive   = true
}

output "gcs_bucket_name" {
  description = "ファイルストレージ用 GCS バケット名"
  value       = var.enable_gcs ? google_storage_bucket.files[0].name : "(未作成)"
}

output "enabled_apis" {
  description = "有効化した GCP API 一覧"
  value       = local.all_apis
}

output "oauth_redirect_uri" {
  description = "OAuth 同意画面に設定するリダイレクト URI"
  value       = "https://${var.echolore_domain}/api/auth/callback/google"
}
