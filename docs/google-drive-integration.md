# Google Drive Integration

Status: **Phase 1 Implemented**
Date: 2026-04-01

## Overview

AI Chat から Google Drive 共有ドライブのコンテンツを検索・参照できるようにする。
方式: **組織単位インデックス + クエリ時権限チェック**。

- サービスアカウント（既存の GCP Credentials）で共有ドライブを一括クロール
- テキスト抽出 → チャンク化 → pgvector に格納（Wiki RAG と同パイプライン）
- AI Chat 時にユーザーのメールアドレスで権限フィルタして検索結果を返す

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    管理者設定                              │
│  Admin → PUT /admin/drive-settings                      │
│  ・対象共有ドライブID一覧                                   │
│  ・同期間隔 (cron)                                        │
│  ・対象MIMEタイプフィルタ                                   │
└───────────────┬─────────────────────────────────────────┘
                │
     ┌──────────▼──────────┐
     │  Drive Sync Worker  │  (定期実行 or 手動トリガー)
     │                     │
     │  1. サービスアカウントで認証
     │  2. 共有ドライブをクロール
     │  3. ファイル内容をエクスポート/取得
     │  4. チャンク分割 → embedding 生成
     │  5. drive_embeddings テーブルに格納
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │    pgvector          │
     │  drive_embeddings    │  (page_embeddings と同構造)
     │  drive_files         │  (メタデータ + 権限キャッシュ)
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │    AI Chat Agent     │
     │                      │
     │  既存: wiki_search, wiki_list_pages, wiki_read_page
     │  新規: drive_search   ← ベクトル検索 + 権限チェック
     │  新規: drive_read     ← ファイル全文取得 + 権限チェック
     └─────────────────────┘
```

## Prerequisites

- サービスアカウントに対象共有ドライブの「閲覧者」権限を付与済み
- Admin UI で GCP Credentials（サービスアカウウント JSON）が設定済み
- EchoLore ユーザーの email が Google Workspace アカウントと一致

## DB Schema

### `drive_files` — Drive ファイルメタデータ

```sql
CREATE TABLE "drive_files" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "mime_type" text NOT NULL,
  "drive_id" text,
  "parent_folder_id" text,
  "web_view_link" text,
  "modified_at" timestamp,
  "content_hash" text,
  "last_indexed_at" timestamp,
  "index_status" text DEFAULT 'pending' NOT NULL,
  "index_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
```

### `drive_embeddings` — page_embeddings と同構造

```sql
CREATE TABLE "drive_embeddings" (
  "id" text PRIMARY KEY NOT NULL,
  "file_id" text NOT NULL REFERENCES "drive_files"("id") ON DELETE CASCADE,
  "chunk_index" integer DEFAULT 0 NOT NULL,
  "plain_text" text NOT NULL,
  "embedding" vector(768) NOT NULL,
  "model_id" text DEFAULT 'gemini-embedding-2-preview' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "drive_embeddings_file_chunk_idx"
  ON "drive_embeddings" USING btree ("file_id", "chunk_index");
```

### `drive_file_permissions` — 権限キャッシュ

```sql
CREATE TABLE "drive_file_permissions" (
  "id" text PRIMARY KEY NOT NULL,
  "file_id" text NOT NULL REFERENCES "drive_files"("id") ON DELETE CASCADE,
  "permission_type" text NOT NULL,
  "email" text,
  "domain" text,
  "role" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "drive_file_permissions_file_idx"
  ON "drive_file_permissions" USING btree ("file_id");
CREATE INDEX "drive_file_permissions_email_idx"
  ON "drive_file_permissions" USING btree ("email");
```

## Admin Settings

`drive-settings-service.ts` — `createTypedSettingsService` パターンに準拠。

```typescript
interface DriveSettings {
  driveEnabled: boolean;
  sharedDriveIds: string[];
  syncIntervalMinutes: number;
  includeMimeTypes: string[];
  excludeFolderIds: string[];
  maxFileSizeBytes: number;
}
```

- GCP サービスアカウント JSON は既存の `gcp-credentials-service.ts` を再利用
- Admin UI に「Google Drive 連携」セクションを追加

## Drive Sync Worker

### 認証

既存の `resolveGcpCredentials()` → サービスアカウント JSON → `google-auth-library` の `GoogleAuth`。

### Crawl Flow

1. `drive.files.list` で対象共有ドライブのファイル一覧を取得
2. 各ファイルについて `content_hash` 比較 → 変更なしならスキップ
3. Google Docs/Sheets/Slides → `files.export` でテキスト取得
4. `drive_files` テーブルにメタデータ upsert
5. permissions 情報を `drive_file_permissions` に同期
6. テキスト → `chunkText()` → `embedText()` → `drive_embeddings` に格納

### Diff Sync

`modifiedTime` + `md5Checksum` で変更検知。未変更ファイルはスキップ。

### Text Extraction by MIME Type

| ファイル種類 | 取得方法 | テキスト化 |
|-------------|----------|-----------|
| Google Docs | `files.export` → `text/plain` | そのまま |
| Google Sheets | `files.export` → `text/csv` | CSV をプレーンテキスト化 |
| Google Slides | `files.export` → `text/plain` | そのまま |
| PDF | `files.get?alt=media` | `pdf-parse` でテキスト抽出 |
| テキストファイル | `files.get?alt=media` | そのまま |

Export 上限: 10MB/回。超過するファイルは `index_status = 'skipped'` で記録。

## Query-Time Permission Check

ベクトル検索結果に対して、リクエストユーザーのメールアドレスでフィルタ。

- `anyone` パーミッション → 全ユーザーに許可
- `domain` パーミッション → 同ドメインユーザーに許可
- `user` パーミッション → 同メールアドレスユーザーに許可

### Permission Cache Freshness

- 同期時に毎回 `permissions` を取得して更新
- 管理者が手動で「権限再同期」をトリガー可能

## AI Chat Agent Tools

既存の `ai-chat-tools.ts` と同パターンで `drive_search` ツールを実装済み。

### Agent System Prompt

```
4. **Drive-based questions**: When wiki search yields insufficient results,
   try `drive_search` to find information in Google Drive shared documents.
```

## Citation Extension

`CitationJson` を拡張:

```typescript
export interface CitationJson {
  pageId?: string;
  pageTitle?: string;
  driveFileId?: string;
  driveFileName?: string;
  driveLink?: string;
  snippet?: string;
  source: "wiki" | "drive";
}
```

フロントエンドの `chat-message-bubble.tsx` で `source === "drive"` の場合は Drive アイコン + 外部リンクとして表示。

## File Structure

```
apps/api/src/
├── services/
│   ├── admin/
│   │   └── drive-settings-service.ts
│   └── drive/
│       ├── drive-sync-service.ts
│       ├── drive-text-extractor.ts
│       ├── drive-permissions-sync.ts
│       └── drive-vector-search-service.ts
├── routes/
│   └── admin/
│       └── admin-drive-settings.ts
├── ai/tools/
│   └── ai-chat-drive-tools.ts
├── repositories/
│   └── drive/
│       └── drive-repository.ts
└── db/migrations/
    └── XXXX_drive_integration.sql
```

## Security Considerations

| Risk | Mitigation |
|------|------------|
| 権限キャッシュの陳腐化 | 同期間隔を設定可能 + 手動再同期 + 検索時に `created_at` フィルタ |
| サービスアカウントの権限過剰 | `drive.readonly` スコープのみ。対象ドライブを管理者が明示指定 |
| プロンプトインジェクション | 既存の `escapeXmlTags()` を Drive コンテンツにも適用 |
| 大量ファイルによるコスト爆発 | `maxFileSizeBytes` + MIME フィルタ + フォルダ除外で制御 |
| Drive API レート制限 | 20,000 req/100s — 同期ワーカーで指数バックオフ実装 |

## Dependencies

- `googleapis` — Google Drive API v3 client
- `pdf-parse` — PDF テキスト抽出 (Phase 2)
- `google-auth-library` — 既存
