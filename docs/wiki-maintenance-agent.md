# Wiki Knowledge Maintenance Agent (Phase 1: Audit)

Last updated: 2026-10-29

## 概要

Wiki チャットの AI エージェントに読み取り専用の「ナレッジ・メンテナンス監査」スキルを追加した。
ユーザーが「ナレッジのメンテ状況は?」「更新されていないページは?」などと質問すると、
エージェントが `wiki_maintenance_report` ツールを実行し、Wiki の健全性監査結果を要約して返す。

同じ監査は外部 AI エージェント向けの **MCP エンドポイント** (`/mcp`) からも利用できる。
詳細は `docs/agent-mcp.md` を参照。

Phase 1 は**監査(読み取り専用)**のみ。提案・書き込み・自動適用は今後のフェーズで検討する。

## 構成要素

| 要素 | ファイル | 役割 |
|------|---------|------|
| 監査サービス | `apps/api/src/services/wiki/wiki-maintenance-service.ts` | 監査ロジック本体 |
| AI ツール | `apps/api/src/ai/tools/ai-chat-maintenance-tool.ts` | `wiki_maintenance_report` ツール定義 |
| エージェント接続 | `apps/api/src/services/ai-chat/ai-chat-ai-service.ts` | ツール登録と引用マージ |
| システムプロンプト | `apps/api/src/ai/agent/create-ai-chat-agent.ts` | メンテ系リクエストのルーティング指示 |

## 監査項目

### レジストリベース(ナレッジ統制: `marketing_knowledge_pages`)

| タイプ | 深刻度 | 条件 |
|--------|--------|------|
| `review_overdue` | high | 承認済みで見直し期限 (`nextReviewAt`) 超過 |
| `review_due_soon` | low | 見直し期限が 14 日以内 |
| `draft_unapproved` | medium | 登録済みだが一度も承認されていない (`status: draft`) |
| `registry_drift` | high | 登録ページが削除済み(登録だけ残存) |

`status: deprecated` のエントリは意図的に廃止されたものであるため監査対象外。

### コンテンツヒューリスティック( Wiki 全体)

| タイプ | 深刻度 | 条件 |
|--------|--------|------|
| `stale_page` | medium | 最終更新から 180 日以上経過 |
| `empty_page` | low | テキストブロックが一つもない |

## 権限モデル

- レジストリ項目は、ナレッジ一覧 API (`GET /api/marketing/knowledge/pages`) と同じ
  「ユーザーが読めるページのエントリのみ返す」ルールでフィルタされる
  (`canReadPage` + ページ個別拒否の除外)。
- コンテンツ項目も管理者 / 一般ユーザーそれぞれの可視ページ集合に対して計算される。
- つまり監査レポートに「読めないページのタイトル」は一切出ない。

## パラメータ(既定値)

| パラメータ | 既定 | 説明 |
|-----------|------|------|
| `staleDays` | 180 | stale_page 判定の日数 |
| `dueSoonDays` | 14 | review_due_soon の猶予日数 |
| `maxFindings` | 50 | レポート上限(深刻度順) |
| `scanLimit` | 500 | コンテンツ監査のスキャンページ数上限 |

## 使い方(Wiki チャット)

チャットで次のような質問をする:

- 「ナレッジのメンテ状況を教えて」
- 「レビュー期限が過ぎているページは?」
- 「中身が空のページはない?」

エージェントが監査レポートを取得し、発見事項を要約する。レポート内のページは引用
(citations) として記録され、UI から該当ページへ遷移できる。

## 今後のフェーズ(未実装)

- Phase 2: 提示スキル — AI がブロック単位の変更案を作成し、承認キューに投入
  (マーケティング変更承認ワークフローのパターンを再利用)
- Phase 3: 低リスク変更(メタデータ更新等)の自動適用(適用前にリビジョン作成)
