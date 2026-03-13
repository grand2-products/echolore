---
name: sync-docs
description: 実装変更を docs/ に伝播し、plan/ から実装済み内容を除去する
user-invocable: true
disable-model-invocation: false
argument-hint: "[変更の概要 or 空]"
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, Agent
---

# 実装内容の docs/ 伝播

直近の実装変更を `docs/` に反映し、`plan/` から実装済み記述を除去する。
AGENTS.md の Documentation Sync Rules と Infra Change Rules に従う。

## 手順

### 1. 変更の把握
- `$ARGUMENTS` が指定されていればそれを変更の概要とする
- 指定がなければ `git diff --name-only HEAD~1` と `git status` で直近の変更ファイルを把握する

### 2. 影響する docs の特定
変更カテゴリに応じて更新対象を判定する:

| 変更カテゴリ | 更新対象 docs |
|---|---|
| インフラ / デプロイ | `docs/system-architecture.md`, `docs/release-workflows.md`, `docs/ops-runbook.md`, `docs/technical-baseline.md` |
| 認証 / 認可 | `docs/system-architecture.md`, `docs/technical-baseline.md` |
| 監視 / 可観測性 | `docs/observability-architecture.md`, `docs/ops-runbook.md` |
| フロントエンド | `docs/frontend-app-implementation.md` |
| ロールバック / 復旧 | `docs/rollback-recovery-architecture.md`, `docs/ops-runbook.md` |
| DB / スキーマ | `docs/technical-baseline.md`, `docs/ops-runbook.md` |

### 3. docs/ の更新
- 各対象ドキュメントを読み、実装変更を反映する
- `Last updated:` の日付を今日に更新する
- 既存の記述スタイルに合わせる（追記ではなく適切な場所に統合する）
- Known Gaps / Known Limits があれば、解消したものを削除し、新たに判明したものを追記する

### 4. plan/ の縮小
- `plan/` 内で今回の変更により完了した項目があれば:
  - チェックボックスを `[x]` にするか、項目を削除する
  - 全項目完了のファイルは削除する
  - `plan/implementation-status-master.md` を更新する

### 5. AGENTS.md の確認
- リポジトリ全体のルールや規約に影響する変更であれば `AGENTS.md` も更新する

### 6. 報告
変更内容を以下の形式で報告する:
- 更新した docs ファイルと変更概要
- plan/ で削除・縮小したファイル
- 未反映の残課題（あれば）
