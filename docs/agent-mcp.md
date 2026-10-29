# Agent MCP Interface (外部 AI エージェント接続)

Last updated: 2026-10-29

## 概要

ChatGPT / Claude / Grok / ローカルエージェント等の外部 AI エージェントを **MCP (Model Context Protocol)** 経由で EchoLore の Wiki に接続するためのインターフェース。
API の `/mcp` エンドポイントがステートレスな MCP サーバーとして動作し、読み取り専用ツールを提供する。

Phase 1 は読み取り専用(検索・読み取り・メンテ監査)。書き込み系(変更提案)は将来フェーズ。

## 認証: エージェントトークン

- 管理者が管理 API で発行する Bearer トークン(形式: `ech_agt_` + base64url)
- **SHA-256 ハッシュのみ DB 保存**。平文は発行時のみ一度返却される
- トークンは**発行した管理者ユーザーの読み取り権限**で動作する(ページ権限は `canReadPage` で判定)
- 作成者が削除・停止されるとトークンは無効化される
- スコープ: 現在 `read` のみ

### 発行・管理 (管理者 API)

```bash
# 発行 (secret はこのレスポンスでのみ返る)
curl -X POST https://<host>/api/admin/agent-tokens \
  -H "Authorization: Bearer <admin-session>" \
  -H "Content-Type: application/json" \
  -d '{"name":"CI agent","scopes":["read"]}'

# 一覧
curl https://<host>/api/admin/agent-tokens -H "Authorization: Bearer <admin-session>"

# 失効
curl -X DELETE https://<host>/api/admin/agent-tokens/<id> -H "Authorization: Bearer <admin-session>"
```

## MCP エンドポイント

- URL: `https://<host>/mcp`
- トランスポート: Streamable HTTP(ステートレス、POST のみ、JSON レスポンス)
- 認証: `Authorization: Bearer ech_agt_...`
- プロトコルバージョン: 2024-11-05 / 2025-03-26 / 2025-06-18 に対応(ネゴシエーション可)

### 提供ツール

| ツール | 説明 |
|--------|------|
| `wiki_search` | ベクトル検索で Wiki ページを検索(タイトル・ID・スニペット) |
| `wiki_read_page` | ページ ID で本文を取得(全文、権限チェックあり) |
| `wiki_maintenance_report` | ナレッジ・メンテナンス監査(レビュー期限超過・未承認・レジストリ不整合・停滞・空ページ) |

いずれもトークン発行者の読み取り権限でフィルタされ、読めないページの情報は返らない。

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
| 管理 API | `apps/api/src/routes/admin/admin-agent-tokens.ts` |
| 共通契約 | `packages/shared/src/contracts/index.ts` (`AgentTokenDto`, `AGENT_TOKEN_SCOPE_VALUES`) |
| DB | `agent_tokens` テーブル(マイグレーション `0022_agent_tokens.sql`) |

## 今後のフェーズ(未実装)

- Phase 2: 書き込み系ツール(変更提案の作成のみ・人間承認必須)と `propose` スコープ
- Phase 3: Agent Skills 配布物 (SKILL.md) の同梱
- 管理画面 UI でのトークン発行・失効操作
