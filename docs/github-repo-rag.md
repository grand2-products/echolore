# GitHub Repository RAG Integration

Status: **Phase 2 Implemented**
Date: 2026-04-09

## Overview

GitHub リポジトリの特定ディレクトリ以下を RAG データソースとして扱い、AI Chat から検索・参照可能にする。
認証は GitHub App のみ。対象ファイルは Markdown (.md/.mdx) とソースコードファイル (.ts, .py, .go 等、設定可能)。
Wiki / Google Drive と並列する第3のデータソースとして統合済み。

## Architecture

```
GitHub App (push webhook)
  → POST /api/github/webhook (HMAC-SHA256 署名検証)
  → triggerGithubPushSyncSerialized (リポジトリ単位で直列化)
  → extractTargetFiles → syncFileFromGitHub
  → stripFrontmatter / extractCodeText → chunkText → embedText → github_embeddings
  → createSyncLog / finishSyncLog (同期ログ記録)

Periodic Full Sync (setTimeout チェーン)
  → syncAllRepos → syncRepo (git tree recursive)
  → Git blob SHA による diff 同期
  → MAX_FILES_PER_CYCLE = 100 / サイクル
  → 同期ログに結果を記録

AI Chat
  → searchGithubForUser (ベクトル検索 + accessScope 評価 + グループフィルタ)
  → github_search / github_read ツール (DynamicStructuredTool)
  → CitationJson source === "github" で引用表示
```

## DB Schema

5 テーブル構成:

- `github_repos` — リポジトリ設定 (owner, name, pathPrefix, installationId, branch, accessScope, fileExtensions)
- `github_files` — インデックス済みファイル (path, sha, plainText, indexStatus)
- `github_embeddings` — チャンク + ベクトル (fileId, chunkIndex, plainText, embedding)
- `github_repo_permissions` — グループ別アクセス制御 (repoId, groupId)
- `github_sync_logs` — 同期履歴 (repoId, trigger, status, filesProcessed, filesAdded, filesUpdated, filesRemoved)

UNIQUE 制約:
- `github_repos(owner, name, path_prefix)`
- `github_files(repo_id, path)`
- `github_embeddings(file_id, chunk_index)`
- `github_repo_permissions(repo_id, group_id)`

Migrations:
- `0013_github_repo_rag.sql` — Phase 1 base tables
- `0014_github_phase2.sql` — Phase 2 tables + fileExtensions column

## File Layout

```
apps/api/src/
├── services/admin/github-settings-service.ts    — Admin 設定 (createTypedSettingsService, encryptedKeys)
├── services/github/
│   ├── github-api-client.ts                     — JWT 生成, インストールトークンキャッシュ, fetchWithRateLimit
│   ├── github-sync-service.ts                   — フル同期, push 差分同期, スケジューラ, 同期ログ
│   ├── github-text-processor.ts                 — stripFrontmatter (YAML/TOML/JSON), isTargetFile, extractCodeText
│   ├── github-vector-search-service.ts          — searchGithubForUser, searchGithubAsSystem, readGithubFileText (グループフィルタ)
│   └── github-webhook-handler.ts                — installation / installation_repositories イベント, 自動リポジトリ検出
├── repositories/github/github-repository.ts     — Kysely CRUD + ベクトル検索クエリ + 権限 + 同期ログ
├── routes/github-webhook.ts                      — Webhook 受信 (認証なし, HMAC 検証)
├── routes/admin/admin-github-settings.ts         — 設定 CRUD (secret mask)
├── routes/admin/admin-github-repos.ts            — リポジトリ CRUD, 同期, 接続テスト, 同期ログ, インストールリポジトリ一覧
└── ai/tools/ai-chat-github-tools.ts              — github_search + github_read ツール
```

## API Endpoints

### Webhook (public, HMAC verified)
- `POST /api/github/webhook` — GitHub Webhook 受信

### Admin (要 admin role)
- `GET/PUT /api/admin/github-settings` — GitHub App 設定 (secret mask)
- `POST /api/admin/github-settings/test` — 接続テスト
- `GET /api/admin/github/repos` — リポジトリ一覧
- `POST /api/admin/github/repos` — リポジトリ追加 (groupIds, fileExtensions 対応)
- `GET /api/admin/github/repos/:id` — リポジトリ詳細 (groupIds 含む)
- `PUT /api/admin/github/repos/:id` — リポジトリ更新 (groupIds, fileExtensions 対応)
- `DELETE /api/admin/github/repos/:id` — リポジトリ削除 (CASCADE)
- `POST /api/admin/github/repos/:id/sync` — 手動同期
- `GET /api/admin/github/repos/:id/status` — 同期状態
- `GET /api/admin/github/repos/:id/sync-logs` — 同期履歴 (Phase 2)
- `POST /api/admin/github/reindex` — 全リポジトリ再インデックス
- `GET /api/admin/github/installation/:installationId/repos` — インストール先リポジトリ一覧 (Phase 2)

## Access Control

### accessScope values:
- `all_members`: 認証済みユーザー全員が検索・参照可能
- `admins`: admin ロールのみ
- `groups`: `github_repo_permissions` に登録されたグループのメンバーのみ (admin は常にアクセス可)

### Enforcement points:
- 検索 (`searchGithubByVectorWithAccessScope`) — ベクトル検索クエリで `accessScope` と `github_repo_permissions` を評価
- 全文参照 (`readGithubFileText`) — リポジトリの `accessScope` とユーザーのグループメンバーシップを評価
- グループメンバーシップは `user_group_memberships` テーブルから取得

## File Type Support

### 対象拡張子:
- デフォルト: `md`, `mdx`
- リポジトリごとに `fileExtensions` カラムで設定可能
- ソースコード: `ts`, `tsx`, `js`, `jsx`, `py`, `rb`, `go`, `rs`, `java`, `kt`, `swift`, `c`, `cpp`, `h`, `sh`, `bash`, `zsh`, `yaml`, `yml`, `json`, `toml`

### テキスト処理:
- Markdown: `stripFrontmatter()` で YAML/TOML/JSON frontmatter を除去
- ソースコード: `extractCodeText()` で空行を除去し、ファイルパスヘッダーを付与

## Frontmatter Support

- YAML: `---\n...\n---\n` (Phase 1)
- TOML: `+++\n...\n+++\n` (Phase 2)
- JSON: `{\n...\n}\n` (Phase 2, JSON.parse 検証付き)

## Sync History

各同期操作は `github_sync_logs` に記録:
- trigger: `manual` / `scheduled` / `webhook`
- status: `running` / `success` / `error`
- filesProcessed, filesAdded, filesUpdated, filesRemoved の統計
- error 時は errorMessage を記録

## Auto Repository Detection

`installation.created` イベント:
1. payload.repositories がない場合、`/installation/repositories` API を照会
2. 既存リポジトリの installationId を更新

`installation_repositories` イベント:
1. repositories_removed → 該当リポジトリの syncStatus を error に設定
2. repositories_added → ログ記録 (自動追加は行わない、admin が手動で追加)

## Admin Settings

`site_settings` テーブルに保存:
- `githubEnabled` (boolean)
- `githubAppId` (string)
- `githubAppPrivateKey` (string, encrypted)
- `githubWebhookSecret` (string, encrypted)
- `githubSyncIntervalMinutes` (number, default 60)
- `githubMaxFileSizeBytes` (number, default 10MB)

## Security

- Webhook 署名検証: HMAC-SHA256 + timingSafeEqual
- CSRF 例外: `/api/github/webhook` (security-middleware.ts)
- プロンプトインジェクション対策: `escapeXmlTags()` を検索スニペット・RAG context・全文返却に適用
- レート制限: fetchWithRateLimit (X-RateLimit-Remaining ≤ 100 で待機, 403 時指数バックオフ)
- 並行実行制御: リポジトリ単位の Promise チェーンで直列化
- グループアクセス制御: `github_repo_permissions` テーブル + `user_group_memberships` JOIN で評価

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| 直接 `fetch` (`@octokit/rest` 不使用) | 自己完結型デプロイポリシー、依存最小化 |
| `content_hash` カラム不採用 | Git blob SHA が raw content から決定論的に生成されるため不要 |
| MDX 内 JSX strip しない | 構造情報として RAG に有用 |
| `site_id` カラム不採用 | 既存テーブルもシングルテナント前提 |
| `github_repo_permissions` テーブル方式 | 多対多関係、既存グループシステムとの統合 |
| `fileExtensions` カラム (text[]) | リポジトリごとの対象拡張子設定、PostgreSQL 配列型 |
| 同期ログの別テーブル | 大量になる可能性があるため `github_repos` から分離 |
| インストールリポジトリの自動追加なし | 意図しないリポジトリのインデックスを防ぐため admin 手動追加 |
