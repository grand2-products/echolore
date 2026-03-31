# Wiki Chat RAG (Retrieval-Augmented Generation)

Last updated: 2026-03-14

## 概要

Wiki ChatのAI回答機能はRAG + Agentハイブリッド構成で動作する。ユーザーの質問に対して必ずベクトル検索を先行実行し、取得したWikiコンテキストをシステムプロンプトに注入した上で、LLMエージェントが回答を生成する。

## 前提条件

- **pgvector**: PostgreSQLイメージが `pgvector/pgvector:pg17` であること（`docker-compose.yml`）
- **Gemini API Key**: エンベディング生成に必須（管理画面の LLM 設定で設定）
- **エンベディングモデル**: デフォルト `gemini-embedding-2-preview`（768次元、管理画面の LLM 設定で変更可能）

## セットアップ手順

### 1. PostgreSQLイメージの更新

`docker-compose.yml` のDBサービスは `pgvector/pgvector:pg17` を使用する。イメージ変更後はコンテナの再作成が必要:

```bash
docker compose down db
docker compose up -d db
```

### 2. マイグレーション実行

```bash
pnpm db:migrate
```

`page_embeddings` テーブルと HNSW ベクトルインデックスが作成される。

### 3. 既存ページの初回インデックス

既存のWikiページにエンベディングを生成するため、管理者が以下を実行する:

```bash
curl -X POST http://localhost:3001/api/admin/reindex-wiki \
  -H "Authorization: Bearer <admin-token>"
```

バックグラウンドで実行される。完了はAPIログで確認:
```
{"event":"admin.reindex-wiki.done","indexed":42,"errors":0}
```

## アーキテクチャ

### データフロー

```
[ページ編集] → indexPage() (fire-and-forget)
  → extractPagePlainText() → stripHtml() → chunkText(1500文字, 200オーバーラップ)
  → embedText(chunk, RETRIEVAL_DOCUMENT, 768次元)
  → page_embeddings テーブルにupsert

[Wiki Chat質問] → searchVisibleChunks(query, 5)
  → embedText(query, RETRIEVAL_QUERY, 768次元)
  → pgvector cosine distance検索
  → 権限フィルタ → ページ重複排除
  → RAGコンテキストとしてシステムプロンプトに注入
  → LLMエージェント生成（追加ツール: wiki_search, wiki_read_page）
  → 回答 + citations
```

### インデックス更新トリガー

以下のREST API操作でエンベディングが自動更新される（fire-and-forget）:

| 操作 | エンドポイント | 動作 |
|------|--------------|------|
| ブロック作成 | POST /api/wiki/blocks | indexPage |
| ブロック更新 | PUT /api/wiki/blocks/:id | indexPage |
| ブロック削除 | DELETE /api/wiki/blocks/:id | indexPage |
| ページタイトル更新 | PUT /api/wiki/:id | indexPage |
| ページ削除(soft) | DELETE /api/wiki/:id | deletePageEmbeddings |
| ページ復元 | POST /api/wiki/trash/:id/restore | indexPage |
| リビジョン復元 | POST /api/wiki/:id/revisions/:revId/restore | indexPage |

### 主要ファイル

| ファイル | 役割 |
|---------|------|
| `apps/api/src/services/wiki/embedding-service.ts` | テキスト抽出、チャンク分割、エンベディング生成、upsert |
| `apps/api/src/services/wiki/vector-search-service.ts` | ベクトル検索、権限フィルタ、ILIKEフォールバック |
| `apps/api/src/services/wiki-chat/wiki-chat-ai-service.ts` | RAG + Agent ハイブリッド生成パイプライン |
| `apps/api/src/ai/agent/create-wiki-chat-agent.ts` | LangGraph ReActエージェント生成 |
| `apps/api/src/ai/tools/wiki-chat-tools.ts` | wiki_search / wiki_read_page ツール |
| `apps/api/src/lib/html-utils.ts` | HTMLタグ除去ユーティリティ |
| `apps/api/src/db/migrations/0012_page_embeddings.sql` | pgvectorマイグレーション |

## オブザーバビリティ

Wiki Chatリクエスト時に以下のstructured logが出力される:

```json
{"event":"wiki-chat.search","query":"...","resultCount":5,"topSimilarity":0.82,"durationMs":150}
{"event":"wiki-chat.generate","conversationId":"...","contextPages":["page1","page2"],"durationMs":2500}
{"event":"wiki-chat.error","conversationId":"...","error":"..."}
```

## トラブルシューティング

### AI回答にWikiの内容が反映されない

1. 管理画面で Gemini API Key が設定されているか確認
2. `page_embeddings` テーブルにデータがあるか確認: `SELECT count(*) FROM page_embeddings;`
3. なければ `POST /api/admin/reindex-wiki` を実行
4. ログで `wiki-chat.search` イベントの `resultCount` と `topSimilarity` を確認

### エンベディングモデルを変更した場合

`model_id` カラムで古いエンベディングを識別できる。モデル変更後は reindex が必要:

```bash
curl -X POST http://localhost:3001/api/admin/reindex-wiki \
  -H "Authorization: Bearer <admin-token>"
```
