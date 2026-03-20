# バックアップ戦略 — 残タスク

統合バックアップスクリプト `scripts/backup.sh` は作成済み (2026-03-19)。
DEPLOYMENT.md セクション 5 にセットアップ手順・リストア手順を記載済み。
オフサイト先は GCS (`ECHOLORE_BACKUP_BUCKET`) を採用。

## 残タスク

- [ ] バックアップ失敗時の通知（メール / Slack webhook）— 現在は cron ログ + exit code のみ
