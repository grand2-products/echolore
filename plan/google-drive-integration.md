# Google Drive Integration Design

Status: **Phase 1 Implemented**
Date: 2026-04-01

## Overview

AI Chat から Google Drive 共有ドライブのコンテンツを検索・参照できるようにする。
方式: **組織単位インデックス + クエリ時権限チェック**（案1）。

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
- Admin UI で GCP Credentials（サービスアカウント JSON）が設定済み
- EchoLore ユーザーの email が Google Workspace アカウントと一致

## 1. DB Schema

### `drive_files` — Drive ファイルメタデータ

```sql
CREATE TABLE "drive_files" (
  "id" text PRIMARY KEY NOT NULL,          -- Google Drive file ID
  "name" text NOT NULL,
  "mime_type" text NOT NULL,
  "drive_id" text,                         -- 共有ドライブID (null = マイドライブ)
  "parent_folder_id" text,
  "web_view_link" text,
  "modified_at" timestamp,                 -- Drive 側の更新日時
  "content_hash" text,                     -- md5Checksum or modifiedTime (差分検知用)
  "last_indexed_at" timestamp,
  "index_status" text DEFAULT 'pending' NOT NULL,  -- pending | indexed | error | skipped
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
  "permission_type" text NOT NULL,     -- 'user' | 'group' | 'domain' | 'anyone'
  "email" text,                        -- user/group のメールアドレス
  "domain" text,                       -- domain 型の場合
  "role" text NOT NULL,                -- 'reader' | 'writer' | 'owner' 等
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "drive_file_permissions_file_idx"
  ON "drive_file_permissions" USING btree ("file_id");
CREATE INDEX "drive_file_permissions_email_idx"
  ON "drive_file_permissions" USING btree ("email");
```

## 2. Admin Settings

`drive-settings-service.ts` — 既存の `createTypedSettingsService` パターンに準拠。

```typescript
interface DriveSettings {
  driveEnabled: boolean;              // 機能 ON/OFF
  sharedDriveIds: string[];           // 対象共有ドライブ ID 一覧
  syncIntervalMinutes: number;        // 同期間隔 (デフォルト: 60)
  includeMimeTypes: string[];         // 対象 MIME (デフォルト: docs, sheets, slides, pdf)
  excludeFolderIds: string[];         // 除外フォルダ
  maxFileSizeBytes: number;           // 最大ファイルサイズ (デフォルト: 10MB)
}
```

- GCP サービスアカウント JSON は既存の `gcp-credentials-service.ts` を再利用
- Admin UI に「Google Drive 連携」セクションを追加

## 3. Drive Sync Worker

### 認証

既存の `resolveGcpCredentials()` → サービスアカウント JSON → `google-auth-library` の `GoogleAuth`。

```typescript
async function createDriveClient() {
  const { gcsKeyJson } = await resolveGcpCredentials(true, null, null);
  const auth = new GoogleAuth({
    credentials: JSON.parse(gcsKeyJson),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}
```

### Crawl Flow

```
1. drive.files.list({
     corpora: "drive",
     driveId: sharedDriveId,
     supportsAllDrives: true,
     includeItemsFromAllDrives: true,
     q: "mimeType='application/vnd.google-apps.document' OR ...",
     fields: "files(id,name,mimeType,modifiedTime,md5Checksum,webViewLink,parents,permissions)"
   })

2. 各ファイルについて:
   - content_hash 比較 → 変更なしならスキップ
   - Google Docs/Sheets/Slides → files.export でテキスト取得
   - PDF → files.get?alt=media → テキスト抽出 (pdf-parse 等)
   - drive_files テーブルにメタデータ upsert
   - permissions 情報を drive_file_permissions に同期

3. テキスト → chunkText() (既存関数を共有) → embedText() → drive_embeddings に格納
```

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

## 4. Query-Time Permission Check

ベクトル検索結果に対して、リクエストユーザーのメールアドレスでフィルタ。

```typescript
async function searchDriveForUser(
  userEmail: string,
  queryEmbedding: number[],
  limit: number
): Promise<DriveSearchResult[]> {
  // ベクトル検索 + 権限 JOIN を 1 クエリで実行
  const results = await db
    .selectFrom("drive_embeddings as de")
    .innerJoin("drive_files as df", "df.id", "de.fileId")
    .innerJoin("drive_file_permissions as dp", "dp.fileId", "df.id")
    .where((eb) =>
      eb.or([
        eb("dp.permissionType", "=", "anyone"),
        eb.and([
          eb("dp.permissionType", "=", "domain"),
          eb("dp.domain", "=", extractDomain(userEmail)),
        ]),
        eb.and([
          eb("dp.permissionType", "=", "user"),
          eb("dp.email", "=", userEmail),
        ]),
      ])
    )
    .where("df.indexStatus", "=", "indexed")
    .select([
      "df.id as fileId",
      "df.name as fileName",
      "df.webViewLink",
      "de.plainText as chunkText",
      sql`1 - (de.embedding <=> ${vectorStr}::vector)`.as("similarity"),
    ])
    .orderBy(sql`de.embedding <=> ${vectorStr}::vector`)
    .limit(limit)
    .execute();

  return deduplicateByFileId(results);
}
```

### Permission Cache Freshness

- 同期時に毎回 `permissions` を取得して更新（API コスト低: 権限はファイルメタデータの一部）
- 管理者が手動で「権限再同期」をトリガーできるエンドポイント
- オプション: `drive_file_permissions.created_at` が古すぎるファイルを検索結果から除外

## 5. AI Chat Agent Tools

既存の `ai-chat-tools.ts` と同パターンで 2 ツール追加。

### `drive_search`

```typescript
export function createAiChatDriveSearchTool(user: SessionUser) {
  const referencedFiles: DriveToolResult[] = [];

  const driveSearchTool = new DynamicStructuredTool({
    name: "drive_search",
    description:
      "Search Google Drive shared files for content matching a query. " +
      "Returns file names, snippets, and links. " +
      "Use when wiki doesn't have the answer.",
    schema: z.object({
      query: z.string().describe("Search query"),
    }),
    func: async ({ query }) => {
      const embedding = await embedText(query, { taskType: "RETRIEVAL_QUERY" });
      const results = await searchDriveForUser(user.email, embedding, 5);
      // format results + track citations
    },
  });

  return { driveSearchTool, referencedFiles };
}
```

### `drive_read`

```typescript
export function createAiChatDriveReadTool(user: SessionUser) {
  const referencedFiles: DriveToolResult[] = [];

  const driveReadTool = new DynamicStructuredTool({
    name: "drive_read",
    description: "Read the full content of a Google Drive file by its ID.",
    schema: z.object({
      fileId: z.string().describe("The Google Drive file ID"),
    }),
    func: async ({ fileId }) => {
      // 権限チェック → drive_embeddings の全チャンクを chunk_index 順に結合して返す
    },
  });

  return { driveReadTool, referencedFiles };
}
```

### Agent System Prompt Update

`create-ai-chat-agent.ts` の Guidelines に追記:

```
4. **Drive-based questions**: When wiki search yields insufficient results,
   try `drive_search` to find information in Google Drive shared documents.
5. **Drive deep-dive**: Use `drive_read` for full content of a Drive file.
```

## 6. Citation Extension

既存の `CitationJson` を拡張:

```typescript
export interface CitationJson {
  // Wiki (既存)
  pageId?: string;
  pageTitle?: string;
  // Drive (新規)
  driveFileId?: string;
  driveFileName?: string;
  driveLink?: string;         // webViewLink
  // Common
  snippet?: string;
  source: "wiki" | "drive";   // ソース識別
}
```

フロントエンドの `chat-message-bubble.tsx` で `source === "drive"` の場合は Drive アイコン + 外部リンクとして表示。

## 7. File Structure

```
apps/api/src/
├── services/
│   ├── admin/
│   │   └── drive-settings-service.ts        # 設定管理
│   └── drive/
│       ├── drive-sync-service.ts            # クロール + インデックス
│       ├── drive-text-extractor.ts          # MIME 別テキスト抽出
│       ├── drive-permissions-sync.ts        # 権限キャッシュ同期
│       └── drive-vector-search-service.ts   # ベクトル検索 + 権限フィルタ
├── routes/
│   └── admin/
│       └── admin-drive-settings.ts          # 管理 API
├── ai/tools/
│   └── ai-chat-drive-tools.ts              # drive_search, drive_read
├── repositories/
│   └── drive/
│       └── drive-repository.ts              # DB 操作
└── db/migrations/
    └── XXXX_drive_integration.sql           # スキーマ追加
```

## 8. Security Considerations

| Risk | Mitigation |
|------|------------|
| 権限キャッシュの陳腐化 | 同期間隔を設定可能 + 手動再同期 + 検索時に `created_at` フィルタ |
| サービスアカウントの権限過剰 | `drive.readonly` スコープのみ。対象ドライブを管理者が明示指定 |
| プロンプトインジェクション | 既存の `escapeXmlTags()` を Drive コンテンツにも適用 |
| 大量ファイルによるコスト爆発 | `maxFileSizeBytes` + MIME フィルタ + フォルダ除外で制御 |
| Drive API レート制限 | 20,000 req/100s — 同期ワーカーで指数バックオフ実装 |

## 9. Dependencies (npm)

- `googleapis` — Google Drive API v3 client
- `pdf-parse` — PDF テキスト抽出 (PDF 対応する場合)
- `google-auth-library` — 既にプロジェクトに存在する可能性あり（要確認）

## 10. Implementation Phases

### Phase 1: Core (MVP)
- DB migration
- Admin settings (API + UI)
- Drive sync worker (Google Docs/Sheets/Slides のみ)
- `drive_search` ツール追加
- Citation 拡張 + フロントエンド表示

### Phase 2: Enhanced
- PDF テキスト抽出対応
- `drive_read` ツール追加
- 同期ステータスの Admin UI 表示 (進捗, エラー件数)
- 手動再同期トリガー

### Phase 3: Advanced
- Drive Events API (Pub/Sub) によるリアルタイム差分同期
- フォルダ単位の権限継承の最適化
- 同期履歴 / 監査ログ
