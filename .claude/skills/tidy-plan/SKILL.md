---
name: tidy-plan
description: plan/ ディレクトリを整理し、完了済み・実装済みの内容を除去する
user-invocable: true
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, Skill
---

# plan/ ディレクトリの整理と docs/ 伝播

`plan/` 配下の全ファイルをレビューし、AGENTS.md の Documentation Sync Rules に従って整理する。
整理後、`/sync-docs` を実行して実装済み内容を `docs/` に伝播する。

## Phase 1: plan/ の整理

1. `plan/` 配下の全 `.md` ファイルを読む（README.md 含む）
2. 各ファイルについて以下を判定する:
   - **全項目が完了済み** → ファイルを削除
   - **完了済みセクションと未完了セクションが混在** → 完了済みセクション（Completed Work, Done 等）を除去し、残タスク・残ギャップ・未決定事項のみに縮小
   - **全項目が未完了** → そのまま残す
3. `plan/implementation-status-master.md` の完了済みストリームを除去
4. `plan/README.md` の Retained Files リストを現存ファイルに合わせる
5. Phase 1 の変更内容を箇条書きで報告する

## Phase 2: docs/ 伝播

Phase 1 で完了済みと判定した内容のうち、`docs/` に未反映のものを伝播する。
`/sync-docs` スキルを実行して、Phase 1 で除去・削除した実装済み内容を `docs/` に反映する。

## 判定基準

- `Status: **COMPLETED**` や全チェックボックスが `[x]` のファイルは削除対象
- `Current State Summary`, `Implemented Behavior`, `Completed Work` などの実装済み記述は `plan/` に残さない（`docs/` に属する内容）
- 残タスクが 0 件になったファイルは削除する
- 削除時にそのファイルを参照している他の `plan/*.md` からもリンクを除去する
