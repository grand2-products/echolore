# 実装メモ（2026-03-10）

## 目的
引き継ぎタスクに基づき、計画ドキュメントと実装の差分を明示し、初期運用のオンボーディングを改善する。

## 今回の反映内容

### 1) APIルーティング修正
- `apps/api/src/index.ts` に `adminRoutes` を追加し、`/api/admin` を接続。

### 2) 計画ドキュメントへの差分注記
- `plan/overview.md`
- `plan/architecture.md`
- `plan/tech-stack.md`
- `plan/timeline.md`

上記4ファイルに、以下の実装差分を注記:
- 実装済み: Wiki / Meetings / Users / Files / LiveKit基本API / Admin API接続
- 未実装: Google SSO本実装、Room向けAI機能（Speech-to-Text、話者分離、録画、要約、Wiki自動スタック）
- Terraform/本番構成は計画先行で、実装は段階的

### 3) 検証コマンド実行結果
- `docker compose config`: 実行可能（`version` フィールド obsolete 警告あり）
- `pnpm lint`: 失敗（既存の `biome.json` 構文不整合）
- `pnpm typecheck`: 失敗（`packages/shared` / `packages/ui` の重複定義、`tsconfig.json` 構文不整合）
- `pnpm build`: `typecheck` 同様の既存不整合により未通過

### 4) 初期運用ドキュメント更新
- `DEVELOPMENT.md` 先頭に「最短起動手順（env作成→compose起動→疎通確認）」を追加
- `README.md` に「技術スタック（現行GCP構成）」セクションを再追加

## 追記（2026-03-10 高優先度タスク完了）

- 技術的負債を解消:
  - `biome.json` の重複・構文崩れを修正
  - `packages/shared/tsconfig.json` / `packages/ui/tsconfig.json` の不整合を修正
  - `packages/shared/src/types/index.ts` / `packages/ui/src/components/Button.tsx` / `packages/ui/src/components/index.ts` の重複定義を削除
- フロントエンドAPI接続を強化:
  - `apps/web/lib/query-client.tsx` を追加し、`apps/web/app/layout.tsx` で `QueryProvider` を導入
  - `apps/web/lib/api.ts` に TanStack Query hooks を追加
  - `apps/web/app/(main)/meetings/page.tsx` / `apps/web/app/(main)/wiki/page.tsx` / `apps/web/app/(main)/page.tsx` を APIデータ参照へ移行
- Wikiエディタ機能を拡充:
  - `apps/web/components/wiki/WikiEditor.tsx` / `apps/web/components/wiki/Toolbar.tsx` で見出し（H1-H3）・箇条書き・番号付きリスト・画像・ファイル添付UIを追加
- ルーティング競合を解消:
  - `apps/web/app/meetings/page.tsx` / `apps/web/app/wiki/page.tsx` / `apps/web/app/wiki/[id]/page.tsx` を削除
- 検証結果:
  - `pnpm typecheck` 通過
  - `pnpm build` 通過

## 運用メモ
- 計画ファイルは「完了済みの計画」になったタイミングで、`docs/` へ要点を移管してから `plan/` 側をクローズする。
- 現時点では `plan/overview.md` / `plan/architecture.md` / `plan/tech-stack.md` / `plan/timeline.md` は全体計画として継続利用中のため、クローズ対象外。
