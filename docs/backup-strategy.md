# バックアップ戦略

## 方針

- バックアップ対象は **PostgreSQL のみ** — ファイルストレージは S3/GCS 直接保存で耐久性を担保
- バックアップ・リストアは **API エンドポイント経由** で実行（サーバーレス対応）
  - `POST /admin/backups/run` — pg_dump → ストリーミングで S3/GCS にアップロード
  - `POST /admin/backups/restore` — S3/GCS からダウンロード → pg_restore
  - `GET /admin/backups/status` — ジョブ状態ポーリング
- Dockerfile に **postgresql17-client** を追加（pg_dump / pg_restore 実行用）
- 世代管理は **API 側** で実施（バケットのライフサイクルルールは使わない）
- スケジューリング: API 内蔵しない。外部トリガー（cron / EventBridge / Cloud Scheduler）
- Admin 設定画面からバックアップ実行・リストア・削除・ステータス確認が可能
