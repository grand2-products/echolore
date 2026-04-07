# Google Drive Integration — 残タスク

> 実装済み設計: [docs/google-drive-integration.md](../docs/google-drive-integration.md)
>
> Phase 1 (MVP) 実装済み: DB migration, Admin settings, Drive sync worker (Google Docs/Sheets/Slides), `drive_search` ツール, Citation 拡張 + フロントエンド表示

## Phase 2: Enhanced

- [ ] PDF テキスト抽出対応 (`pdf-parse`)
- [ ] `drive_read` ツール追加 — ファイル全文取得 + 権限チェック
- [ ] 同期ステータスの Admin UI 表示 (進捗, エラー件数)
- [ ] 手動再同期トリガー

## Phase 3: Advanced

- [ ] Drive Events API (Pub/Sub) によるリアルタイム差分同期
- [ ] フォルダ単位の権限継承の最適化
- [ ] 同期履歴 / 監査ログ
