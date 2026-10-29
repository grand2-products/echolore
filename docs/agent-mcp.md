# Agent MCP Interface (外部 AI エージェント接続)

Last updated: 2026-10-29

## 概要

ChatGPT / Claude / Grok / ローカルエージェント等の外部 AI エージェントを **MCP (Model Context Protocol)** 経由で EchoLore の Wiki に接続するためのインターフェース。
API の `/mcp` エンドポイントがステートレスな MCP サーバーとして動作する。

読み取り系(検索・読み取り・メンテ監査)に加え、対話での明示的な依頼に基づく**新規ページ作成**(`write` スコープ)を提供する。
既存ページの編集ツールは提供しない(将来は提案+承認方式で検討)。

## 認証: エージェントトークン

- 管理者が管理 API で発行する Bearer トークン(形式: `ech_agt_` + base64url)
- **SHA-256 ハッシュのみ DB 保存**。平文は発行時のみ一度返却される
- トークンは**発行した管理者ユーザーの読み取り権限**で動作する(ページ権限は `canReadPage` で判定)
- 作成者が削除・停止されるとトークンは無効化される
- スコープ: `read`(参照系ツール)と `write`(ページ作成ツール)。発行時の既定は `read`(最小権限)

### 発行・管理

管理画面の **管理 → AI 設定 → 「外部 AI エージェント接続 (MCP)」** セクションから
発行・一覧・失効ができる(平文トークンは発行時に一度だけ表示)。

管理 API を使う場合:

```bash
# 発行 (secret はこのレスポンスでのみ返る)
curl -X POST https://<host>/api/admin/agent-tokens \
  -H "Authorization: Bearer <admin-session>" \
  -H "Content-Type: application/json" \
  -d '{"name":"CI agent","scopes":["read"]}'

# 書き込み付きトークン (ページ作成を許可)
curl -X POST https://<host>/api/admin/agent-tokens \
  -H "Authorization: Bearer <admin-session>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Author agent","scopes":["read","write"]}'

# 一覧
curl https://<host>/api/admin/agent-tokens -H "Authorization: Bearer <admin-session>"

# 失効
curl -X DELETE https://<host>/api/admin/agent-tokens/<id> -H "Authorization: Bearer <admin-session>"
```

## MCP エンドポイント

- URL: `https://<host>/mcp`
- トランスポート: Streamable HTTP(ステートレス、POST のみ、JSON レスポンス)
- 認証: `Authorization: Bearer ech_agt_...`
- プロトコル: **MCP 2026-07-28 専用**(旧リビジョンの `initialize` ハンドシェイク方式には非対応)

### プロトコル詳細 (2026-07-28)

- セッションレス方式: `initialize` / `ping` は廃止。毎リクエストの `params._meta` に
  `io.modelcontextprotocol/protocolVersion` を携带し、結果は `resultType: "complete"` を返す
- `server/discover` を実装(対応バージョン・能力・サーバー情報の広告)
- 必須ヘッダーを検証: `MCP-Protocol-Version`(body の `_meta` と一致必須)、
  `Mcp-Method`(body と一致必須)、`tools/call` では `Mcp-Name`(`params.name` と一致必須)。
  不一致は `-32020 HeaderMismatch`、未対応バージョンは `-32022`(`supportedVersions` 付き)
- 未実装メソッドは HTTP 404 + `-32601`
- `tools/list` はトークンのスコープでツール集合をフィルタし、決定的順序 + `ttlMs`/`cacheScope` を返す
- ツール引数のバリデーションエラーは `isError: true` の実行エラーとして返却(SEP-1303)
- `Origin` ヘッダー検証: 許可オリジン(CORS 設定)以外のブラウザ起源リクエストは 403

### 提供ツール

| ツール | 必要スコープ | 説明 |
|--------|-------------|------|
| `wiki_search` | `read` | ベクトル検索で Wiki ページを検索(タイトル・ID・スニペット) |
| `wiki_read_page` | `read` | ページ ID で本文を取得(全文、権限チェックあり) |
| `wiki_maintenance_report` | `read` | ナレッジ・メンテナンス監査(レビュー期限超過・未承認・レジストリ不整合・停滞・空ページ) |
| `wiki_create_page` | `write` | Markdown から新規ページを作成。対話での明示的な依頼(「記事にして」「シェアしたい」)時のみ使用。既存ページは変更しない |

いずれもトークン発行者の権限でフィルタされ、読めないページの情報は返らない。

### ページ作成 (`wiki_create_page`) の設計

- **作成者は要求ユーザー(トークン発行者)**。サーバー側で固定され、クライアントは authorId を指定できない
- 対象スペースへの書き込み権限を `canAccessSpace(user, space, "write")` で判定
- Markdown は `parseMarkdown` で BlockNote ブロックに変換して保存(既存のインポート機能と同じ経路)
- 作成後に `indexPage` で embedding を生成(チャット検索対象になる)
- 監査ログに `wiki.page.create.agent` として記録(AI 経由であることが追跡可能)
- **新規作成のみ**。既存ページの編集は将来の「提案+承認」方式でのみ提供予定

### クライアント設定例 (Claude / その他の MCP クライアント)

```json
{
  "mcpServers": {
    "echolore": {
      "type": "http",
      "url": "https://<host>/mcp",
      "headers": {
        "Authorization": "Bearer ech_agt_..."
      }
    }
  }
}
```

### Agent Skills 配布物

`skills/echolore-wiki-maintenance/SKILL.md` に、外部エージェント
(Claude 等) に読み込ませるスキル定義を同梱している。監査・調査・記事化
のワークフローと、書き込みツールの利用規律 (明示依頼時のみ) が
定義されている。

## セキュリティ設計

- CSRF 対象外(パス `/mcp` は Origin 検証をスキップ)。根拠: Bearer トークンはブラウザが自動添付しないため CSRF 安全。既存の bearer スキップと同じ理屈だが、エージェントトークンは独自形式(ドットなし)のため明示スキップ
- セッション認証 (`authGuard`) の外側にマウント。`/mcp` はエージェントトークン認証のみで独立
- ツール実行は毎回 JSON ログ出力 (`event: "mcp.tool.call"`)
- 未知ツール → JSON-RPC エラー (-32602)、未知メソッド → -32601
- ツール内部エラーは `isError: true` の tool result として返却(プロトコルエラーと区別)

## 実装構成

| 要素 | ファイル |
|------|---------|
| MCP ルート | `apps/api/src/routes/mcp.ts` |
| エージェントトークンサービス | `apps/api/src/services/admin/agent-token-service.ts` |
| エージェントトークンリポジトリ | `apps/api/src/repositories/admin/agent-token-repository.ts` |
| 記事化サービス (Markdown→ページ) | `apps/api/src/services/wiki/wiki-article-creation-service.ts` |
| 管理 API | `apps/api/src/routes/admin/admin-agent-tokens.ts` |
| 共通契約 | `packages/shared/src/contracts/index.ts` (`AgentTokenDto`, `AGENT_TOKEN_SCOPE_VALUES`) |
| DB | `agent_tokens` テーブル(マイグレーション `0022_agent_tokens.sql`) |

Wiki チャット側にも同じ「記事化」ツールが接続されている
(`apps/api/src/ai/tools/ai-chat-create-page-tool.ts`)。チャットで
「これを記事にして」等と依頼すると、対話内容から Markdown 記事を起草して
ページを作成する。

## 今後のフェーズ(未実装)

- 既存ページ編集の提案スキル(作成のみ・人間承認必須)
