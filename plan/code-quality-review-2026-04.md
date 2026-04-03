# コード品質・セキュリティレビュー (2026-04)

前回レビュー (`security-vulnerability-review.md`) で対応済みの項目を除いた、新規発見の不備一覧。
全20件対応完了。

---

## Critical — 全件対応済み

### ~~C1: Docker Socket 直接マウント（本番）~~ ✅
- **対応**: `tecnativa/docker-socket-proxy` を Traefik 用・updater 用にそれぞれ導入。Traefik は read-only (CONTAINERS のみ)、updater 用は操作権限付き。`socket-proxy` ネットワークを `internal: true` で隔離。Docker Socket の直接マウントを全て排除

### ~~C2: speakerUserId の未検証（トランスクリプト偽造）~~ ✅
- **対応**: `validateSpeakerUserId()` で DB ユーザー存在を検証。存在しない場合は null にフォールバック

### ~~C3: participantIdentity のなりすまし~~ ✅
- **対応**: `validateParticipantUser()` で非ゲスト参加者のユーザー存在を検証。存在しない場合は 400 エラー

---

## High — 全件対応済み

### ~~H1: ファイル削除のレースコンディション~~ ✅
- **対応**: DB 削除を先に実行し、ストレージ削除は後続処理に変更

### ~~H2: アバター削除の同様のレースコンディション~~ ✅
- **対応**: DB の avatarUrl を先に null 更新し、ファイル削除は後続処理に変更

### ~~H3: updater Dockerfile に USER ディレクティブなし~~ ✅
- **対応**: Dockerfile に非 root ユーザー (`updater`, uid 1000) を追加。本番 compose で `user: "1000:1000"` に変更。Docker Socket アクセスは `updater-socket-proxy` 経由に変更

### ~~H4: GitHub Actions 権限の過剰~~ ✅
- **対応**: ci.yml に `permissions: contents: read` 追加。softprops/action-gh-release を SHA ピン留め

### ~~H5: 頻出カラムのインデックス不足~~ ✅
- **対応**: migration `0010_add_missing_indexes.sql` で `blocks.page_id`, `files.uploader_id`, `meeting_invites.token`, `meeting_transcript_segments(meeting_id, started_at)` にインデックス追加

---

## Medium — 全件対応済み

### ~~M1: エラーメッセージの情報漏洩~~ ✅
- **対応**: `withErrorHandler` / `tryCatchResponse` で内部エラー詳細をクライアントに返さないよう修正

### ~~M2: ゲスト承認のべき等性なし~~ ✅ 確認済み (対応不要)
- `resolveGuestRequest()` は `WHERE status = 'pending'` 条件付きのため、既に解決済みのリクエストには null が返る

### ~~M3: fire-and-forget のインデクシング失敗が追跡不能~~ ✅
- **対応**: `indexPageBackground()` ラッパーを追加し、構造化ログ (`event: "wiki.indexPage.done"` / `"wiki.indexPage.error"`) を出力。全7箇所の呼び出しを統一

### ~~M4: ファイル一覧にページネーションなし~~ ✅
- **対応**: `listFiles()` / `listFilesByUploader()` に `limit/offset` パラメータ追加。`countFiles()` / `countFilesByUploader()` を新規追加。ルートハンドラで `parsePaginationParams()` を使用し `total` を返却

### ~~M5: install.sh / update.sh のインジェクションリスク~~ ✅
- **対応**: install.sh に DOMAIN フォーマットバリデーション追加。update.sh の sed デリミタを `|` に変更

### ~~M6: N+1 クエリ（ミーティング詳細取得）~~ ✅
- **対応**: `getMeetingTranscripts` と `getMeetingSummaries` を `Promise.all()` で並列化

---

## Low — 全件対応済み

### ~~L1: useEffect の依存配列欠落~~ ✅
- **対応**: 両方の useEffect に適切な依存配列を追加

### ~~L2: .npmrc の重複エントリ~~ ✅
- **対応**: 重複を削除

### ~~L3: CI audit ジョブが continue-on-error: true~~ ✅
- **対応**: `continue-on-error: true` を削除し、audit 失敗時にビルドを停止するよう変更

### ~~L4: ファイル操作の監査ログなし~~ ✅
- **対応**: ファイル upload/delete に `auditAction()` 追加
