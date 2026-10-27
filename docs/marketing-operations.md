# Marketing Operations (マーケティング運用)

Status: **Implemented (MVP)**
Date: 2026-10-27

## Overview

サイドバーの「マーケティング」セクション（`/marketing`）で、マーケティング運用の
**資産・データ・ナレッジ・変更承認**を一つの入口から扱う。ナレッジは既存の Wiki を
正本とし、本セクションはその統制情報（責任者・状態・見直し期限）と、媒体データの
取り込み・ダッシュボード・承認フローを提供する。

目的は「意思決定・知識・管理責任の社内保有」。担当者が交代しても、ダッシュボードを
見る → 施策を判断する → 文書を更新する → 担当を交代する → 障害から復旧する、
の一連を社内で再現できる状態をつくる。

社内の実行計画書（マーケティング運用内製化 実行計画書 v1.0）は GitHub を中心とした
構成を想定しているが、本実装は同じ要求を echolore 上で満たす。対応は下記
「計画書の要求との対応」を参照。

## Screens

| Route | 内容 |
| --- | --- |
| `/marketing` | 運用健全性タイル（定時更新達成率・主副担当設定率・標準手順の承認率・進行中の変更・照合待ち）と既定ダッシュボード |
| `/marketing/dashboards` | ダッシュボード一覧、新規・テンプレート・JSON 取り込み、既定の設定 |
| `/marketing/dashboards/[id]` | 表示（期間切替）、編集（ウィジェット構成）、版履歴と復元、JSON 書き出し |
| `/marketing/assets` | 資産台帳。詳細で権限一覧（外部サービス側の権限）、月次確認、関連する変更 |
| `/marketing/connectors` | データ連携。接続テスト、今すぐ取得、CSV 取込、取得履歴と品質確認 |
| `/marketing/changes` | 変更管理（課題・変更提案・障害）一覧と起票 |
| `/marketing/changes/[id]` | 内容、承認フロー操作、経緯（イベント）、事後レビュー期限 |
| `/marketing/knowledge` | Wiki ナレッジの 6 階層レジストリ、初期ツリー作成、承認・見直し・廃止 |
| `/marketing/reconciliations` | 元画面との数値照合の記録とレビュー |
| `/marketing/metrics` | KPI 辞書（全指標の定義・計算式・媒体間の合算可否） |
| `/marketing/settings` | 保存期間・鮮度基準（manage のみ） |

Wiki のページ詳細（`/wiki/[id]`）には、レジストリに登録されたページの状態バナー
（承認済み / 下書き / 廃止と移行先、責任者・副担当・次回見直し日）が表示される。

## Permissions

権限はユーザーグループの permission として付与する（管理 → アクセス管理）。
計画書の Team 案との対応:

| Group permission | 計画書の Team | できること |
| --- | --- | --- |
| `marketing.view` | marketing-viewers | 全画面の閲覧、課題・変更の起票とコメント |
| `marketing.operate` | marketing-operators | 台帳・ダッシュボード・変更の編集と状態遷移、CSV 取込、ナレッジ登録・見直し・廃止、照合の記録 |
| `marketing.review` | marketing-reviewers | 変更・ナレッジ・照合の承認（自分の作成物は不可） |
| `marketing.manage` | platform-maintainers | コネクター（認証情報）・設定・削除系 |
| Admin role | repo-admins | 全権限 |

- 含意: `manage ⊇ operate ⊇ view`、`review ⊇ view`。`review` は `manage` に含めない
  （作成者と承認者の分離を明示的な付与にするため）。
- サイドバー項目は `GET /api/marketing/access` の結果で `marketing.view` 保持者にのみ表示。
  すべての判定はサーバー側（`apps/api/src/policies/marketing-policy.ts`）で行い、拒否は
  `authz.denied`（resourceType `marketing`）として監査ログに残る。
- 自己承認の禁止: 変更の承認・差戻し（起票者）、ナレッジ承認（責任者・ページ作成者）、
  照合レビュー（記録者）はサーバーで拒否（`MARKETING_SELF_APPROVAL`）。
- ナレッジのレジストリ一覧は、利用者が読める Wiki ページのみ返す。ページバナー
  （`GET /api/marketing/knowledge/by-page/:pageId`）は `marketing.view` 不要だが、
  Wiki の閲覧権限（`canReadPage`）で判定する。

## Asset register (資産台帳)

`marketing_assets` に、サービス名／種別ごとの識別子／利用目的／
所有主体／請求主体／主担当・副担当／代理店と契約・共有関係／関連資産／
管理画面URL・公開URL／緊急時の代行者・連絡先／手順の Wiki ページ／確認周期と最終確認日
を持つ。所有主体・担当・確認周期などの統制項目は全種別で共通。識別子だけが種別ごとに異なる。

識別子は `identifiers`（JSON オブジェクト）に正規化して保存する。画面の項目は種別に従う。

| 種別 | 識別子 |
| --- | --- |
| `ga4` | `propertyId`（必須。数字。Data API の `properties/{id}`。`properties/` は外して保存）。`measurementId`（任意。`G-`。取得入力には使わない） |
| `meta_ads` | `adAccountId`（必須。`act_` 付きまたは数字。数字だけ保存）。`pixelId`（任意。数字。`act_` は不可。Insights の入力には使わない） |
| `google_ads` | `customerId`（必須。10 桁。ハイフンは除去） |
| `gtm` | `containerId`（必須。`GTM-`。大文字で保存） |
| `domain` | `hostname`（必須。ASCII の LDH。パス・ポート・ユーザー情報は不可。日本語ドメインは利用者が punycode で書く） |
| `landing_page` | 識別子なし。公開 URL が識別になる |
| `other` | `label`（任意。秘密は拒否） |

- 作成時に識別子を省略すると `{}` になり、必須項目がある種別は 400。更新で `identifiers` を省略すると保存済みの値を残す。`{}` を送ると置き換える。
- 種別を変えると、画面は確認のあと識別子を空にする。別種別の値は移さない。
- 認証秘密は台帳に記載しない。`secretReference` は保管庫の参照先のみ。識別子の値に秘密鍵を書くことも拒否する。
- 既存の `external_id` と `measurement_ids` は起動時バックフィルで `identifiers` へ写す（移行 0020 は列追加のみ。写し自体は API プロセス）。未写しが残るあいだ古い列は残す。削除は、未写しが 0 件になってから別リリースで行う。
- 主担当と副担当は同一人物にできない。
- 権限一覧（`marketing_asset_access`）は外部サービス側で誰がどの権限を持つかの記録。
  代理店・外部委託には終了日が必須。承認者は記録した操作者。期限切れは概要に集計。
- 「確認済みにする」で `lastVerifiedAt` を更新（月次の台帳・実権限照合）。
  周期超過は「要確認」と表示。

## Data connectors

汎用コネクター設計。`apps/api/src/services/marketing/connectors/` の
`MarketingConnectorDefinition` を実装して `registry.ts` に登録すれば、保存・品質確認・
カバレッジ・スケジュール・ダッシュボードは共通処理を使う。

| Type | 取得内容 | 認証 |
| --- | --- | --- |
| `meta_ads` | Marketing API Insights（campaign × day）: cost, impressions, clicks（既定はリンククリック）, conversions / conversion_value（設定したアクション種別の合計、`use_unified_attribution_setting=true`） | システムユーザーのアクセストークン |
| `google_ads` | Google Ads API `searchStream`（campaign × day）: cost（micros 換算）, impressions, clicks, conversions, conversion_value | OAuth リフレッシュトークン + 開発者トークン（任意で login-customer-id） |
| `ga4` | Data API `runReport`: sessions / key_events（landingPage 別）、lp_views（pagePath 別）、form_starts / form_submits（イベント名 × pagePath） | サービスアカウント JSON（または管理設定の GCP 認証情報を流用） |
| `lp_monitor` | 各 URL の HTTP 応答・期待する計測 ID（GTM-/G-）・フォームの有無 | なし |
| `csv` | CSV 取込専用（問い合わせ・売上など） | なし |

- API バージョンは設定可能（既定: Meta `v23.0`、Google Ads `v23`）。各サービスの
  利用条件・バージョン廃止は実装開始時に再確認する。
- 認証情報は AES-256-GCM（`ENCRYPTION_KEY`）で暗号化して保存し、API は
  「設定済みのキー名」だけを返す。書き込み専用で、空欄送信は既存値を保持、明示的な
  削除操作でのみ消去。復号はサーバーの同期処理内のみ。
- 設定値は種別ごとに宣言されたキーだけを保存する（任意データを保存させない）。保存時に識別子は正規化する（`properties/`・`act_`・`customers/` とハイフンを外した値を保存する）。
- コネクターと資産の種別は、新規の紐づけと資産の付け替えで一致が必要（`MARKETING_ASSET_TYPE_MISMATCH`）。すでに付いている資産を同じ ID のまま保存することは、種別が違っていても残せる。
- 画面は紐づく資産の識別子をコネクター設定へ転記する。転記はブラウザ上だけで、台帳へは書き戻さない。取得が使う値はコネクター設定が正本。利用者がすでに編集した項目は転記で上書きしない。
- 取得行のアカウント ID が空のときだけ、GA4 は `propertyId`、Meta は広告アカウント ID、Google 広告は顧客 ID を補う。API の ID が設定と違うときは警告を残し、行の ID は API の値のままにする。警告だけでは実行を要確認にはしない。
- `GET /marketing/connectors/types` が返す項目は `key` / `kind` / `required` / `placeholder` のみ。
- LP 監視は SSRF 対策としてループバック・プライベート・リンクローカル宛てを拒否する。
  社内向けページを監視する自己ホスト環境では `MARKETING_ALLOW_PRIVATE_URLS=true` で解除。

### Scheduling and runs

- API 起動時に `startMarketingSyncScheduler()`（10 分ごと）。有効かつ同期対応の
  コネクターのうち、前回実行から `syncIntervalHours` 経過したものを実行。
- 範囲: 既定は `[今日 - lookbackDays, 昨日]`（コネクターの時刻帯）。直近 7 日を毎日
  再取得して遅延 CV を吸収する。LP 監視は当日のみ。
- `run_lock_until` による原子的な取得ロックで、複数レプリカ・手動実行との二重取得を防止
  （手動実行中は 409 `MARKETING_SYNC_LOCKED`）。手動取得はバックグラウンドで実行される。
- HTTP は 429 / 5xx / 媒体の制限コードで指数バックオフ再試行。エラーメッセージに URL や
  認証情報を含めない。
- 失敗時（直前が失敗でない場合）や LP 監視の警報時、対象資産の主担当・副担当へメール通知。

### Storage, quality and coverage

- `marketing_metrics_daily` は 1 行 = 1 日 × コネクター × アカウント × キャンペーン ×
  セグメント × 基本指標の縦持ち。比率は保存しない。
- `replace` モード: 取得範囲の既存行を削除して書き込む（重複排除・再取得）。
  `accumulate` モード（LP 監視）: 同じキーに加算。
- 書き込み前の品質確認（`normalizeConnectorRows`）: 範囲外・未知指標・非数値は不正行として除外、
  重複キーは最後の値を採用して件数を記録、負値は残して件数を記録、行のない日を記録。
  問題があれば実行結果は `partial`（要確認）。結果は取得履歴に保存される。
- `marketing_metric_coverage` に取得成功日を記録し、**未取得とゼロを区別**する。
  ダッシュボードは未取得日を「未取得」と表示し、ゼロとして扱わない。
- 最終成功から `staleAfterHours`（既定 36 時間）を超えると「更新遅延」を表示。

### CSV import

API 承認待ちの暫定連携と、CSV 専用データの取り込みに使う。全コネクターで利用可
（`marketing.operate`）。

- 1 行目に列名。`date` 必須。任意で `account_id, campaign_id, campaign_name, segment`。
  指標列は KPI 辞書の基本指標キーで、そのコネクターが生成する指標に限る。未知列はエラー。
- 日付は `YYYY-MM-DD` / `YYYY/MM/DD` / `YYYYMMDD`。空欄はゼロではなく未入力。
- 対象期間（省略時はファイル内の最小〜最大日）の既存データを置き換え、その期間を取得済みとして記録する。
- 最大 5MB / 200,000 行 / 400 日。

## Metrics (KPI 辞書)

定義は `packages/shared/src/contracts/marketing.ts` の `MARKETING_METRICS` が正本。

- 基本指標: cost, impressions, clicks, conversions（媒体CV）, conversion_value,
  sessions, lp_views, form_starts, form_submits, key_events, inquiries, revenue,
  uptime_checks, uptime_successes, response_ms_total
- 派生指標（合計 ÷ 合計）: ctr, cpc, cpa, cvr, form_completion_rate, roas,
  availability, avg_response_ms。分母 0 は `null`（算定不可）。
- 媒体間で合算しない指標（conversions, conversion_value, key_events, inquiries, revenue と
  それらを含む派生指標）を要求すると、クエリは自動で `source` 別に分割する
  （`splitBySource`）。Meta CV・Google CV・GA4 キーイベントを単純合算しない。
- 複数通貨が混在する場合は通貨別に分割し（`splitByCurrency`）、原額を保持する。換算はしない。

`POST /api/marketing/metrics/query` が唯一の集計 API。レスポンスには対象コネクターごとの
`coverage`（最終成功・遅延・未取得日）が含まれる。

## Dashboards (Dashboard-as-Code)

- 3 列グリッドのウィジェット構成（`kpi`, `timeseries`, `breakdown`, `funnel`,
  `freshness`, `assets`, `changes`, `reviews`, `links`, `note`）。各ウィジェットに
  根拠の Wiki ページを紐付けられる。
- 時系列は指標ごとに 1 チャート（第 2 軸を使わない）。媒体の色は媒体に固定。
  表表示への切替あり。
- 保存のたびに版（`version`）を上げ、変更理由（必須）とともに `marketing_dashboard_revisions`
  に定義全体を保存。画面に版番号とデータ更新状況を表示。過去版の復元は新しい版として記録。
- 編集時の版を `expectedVersion` として送り、他者の更新と衝突した場合は 409。
- JSON の書き出し・取り込み（`format: echolore.marketing-dashboard`）で、定義を
  Git 等で版管理できる。取り込み時、存在しない Wiki ページ ID は外す。
- テンプレート「経営・運用ダッシュボード」は、計画書 MVP の問い（いくら使いどこで成果が出ているか /
  LP のどこで離脱しているか / 数値はいつ更新されたか / 誰の承認が必要か / 手順と過去の判断はどこか）
  に答える構成。ナレッジ作成済みなら入口ページを手順リンクに設定する。

## Change management

`marketing_change_requests` と `marketing_change_events`（全操作の経緯）。

```
open ─submit→ in_review ─approve→ approved ─implement→ implemented ─verify→ verified ─close→ closed
  ▲              │reject
  └──reopen── rejected                       (closed も reopen 可)
```

- 種類: 広告の新規出稿・予算変更・広告停止・GTM/GA4 設定・LP 公開・ダッシュボード公開・
  緊急対応・障害・その他。種類ごとに計画書の承認・検証条件を画面に表示。
- 緊急対応・障害は承認前に実施でき、事後レビュー期限（翌営業日）を設定。承認（事後レビュー）が
  ない限り完了にできない。期限超過は一覧・概要に表示。
- 検証には結果（証跡）が必須、差戻しには理由が必須。承認後は内容を編集できない（起票・差戻し状態のみ編集可）。
- 状態遷移は期待状態を条件にした更新で、同時操作の二重適用を防ぐ。

## Knowledge (Wiki)

- 初期ツリー作成（`POST /api/marketing/knowledge/bootstrap`, manage）: 選択したチームスペース
  （省略時は General）に「マーケティング運用ナレッジ」と 01 方針 / 02 資産・権限 / 03 計測・データ（KPI辞書）/
  04 標準手順（手順書テンプレート）/ 05 施策・判断（施策記録・障害・判断記録テンプレート）/
  06 教育・継承 を作成し、すべて下書きでレジストリ登録する。再実行は 409。
- レジストリ（`marketing_knowledge_pages`）: 階層、文書種別、目的、対象範囲、責任者、副担当、
  状態（下書き・承認済み・廃止）、見直し周期（既定 90 日、02 資産・権限は 30 日）、次回見直し日、
  承認者、移行先、関連資産。
- 承認すると見直し日を更新。承認後に Wiki ページが更新されると「承認後に変更あり」を表示。
- 廃止時に移行先ページを指定でき、元ページのバナーに移行先を表示。

## Reconciliation (元画面との数値照合)

`marketing_reconciliations`。コネクター・指標・期間（既定は直近 7 日）・元画面の値・
許容差（既定 1%）・差異の説明を記録する。取り込み値はサーバーが保存データから計算し、
クライアント値は受け取らない。許容差を超える差異は説明がないと承認できない。

## Retention and audit

- 集計データ（metrics / coverage）: 既定 13 か月。処理ログ（sync runs）: 既定 90 日。
  設定画面で変更可能。スケジューラが 1 日 1 回削除する。
- 全書き込み操作は `auditAction` で `marketing.*` として監査ログに記録。認証情報の値は
  記録しない（変更されたキー名のみ）。

## Operations

1. 管理 → アクセス管理でグループを作成し、`marketing.*` 権限を付与する。
2. `/marketing/knowledge` で初期ツリーを作成する（manage）。チームスペースを選ぶと閲覧はそのグループに限定。
3. `/marketing/assets` で棚卸しした資産を登録する。識別子は種別の項目だけを入れ、主副担当・権限一覧を記録する。
4. `/marketing/connectors` でコネクターを追加する。資産を選ぶと識別子が転記される。接続テスト → 今すぐ取得。API 承認前は CSV 取込で代替。
5. `/marketing` でテンプレートからダッシュボードを作成し、直近 7 日を元画面と照合して記録する。

API 未承認・データ収集停止時は、ダッシュボードに警告が出る。媒体の一次画面で運用を継続し、
変更管理に障害として起票する。

## Data model

| Table | 用途 |
| --- | --- |
| `marketing_assets` / `marketing_asset_access` | 資産台帳（`identifiers`）と外部サービス側の権限一覧。旧 `external_id` / `measurement_ids` はバックフィル完了まで残す |
| `marketing_connectors` | コネクター設定（暗号化された認証情報、スケジュール、ロック、最終状態） |
| `marketing_sync_runs` | 取得履歴と品質確認結果 |
| `marketing_metrics_daily` | 日次の基本指標（縦持ち） |
| `marketing_metric_coverage` | 取得成功日（未取得とゼロの区別） |
| `marketing_dashboards` / `marketing_dashboard_revisions` | ダッシュボード定義と版履歴 |
| `marketing_change_requests` / `marketing_change_events` | 変更・課題と経緯 |
| `marketing_knowledge_pages` | Wiki ページの統制情報 |
| `marketing_reconciliations` | 数値照合 |

Migration: `apps/api/src/db/migrations/0019_marketing_operations.sql`、`0020_marketing_asset_identifiers.sql`（識別子列の追加。旧列の削除は含まない）

## 計画書の要求との対応

| 計画書 | 実装 |
| --- | --- |
| 対象範囲と資産の把握（p.3）・資産台帳の必須項目 | 資産台帳・権限一覧・確認周期 |
| 推進体制と責任分担・RACI（p.4） | ナレッジ入口ページ（RACI 表）、主副担当、自己承認禁止 |
| Repo 中心の運用設計・Docs/Dashboard-as-Code（p.5） | Wiki（版履歴）＋レジストリ、ダッシュボード版履歴・変更理由・JSON 書き出し |
| データ連携と利用の構成（p.6） | 汎用コネクター、日次取得・再試行・重複排除・エラー通知・サーバー側認証、CSV 暫定連携 |
| 指標・計測・データ品質（p.7） | KPI 辞書、合計÷合計、算定不可、媒体別表示、通貨別、品質確認、未取得表示、直近再取得 |
| ナレッジ体系と更新責任（p.8） | 6 階層の初期ツリー・テンプレート、責任者・副担当・状態・見直し期限、廃止と移行先 |
| 日常運用と変更の承認（p.9） | 変更管理（種類別条件、緊急対応の事後レビュー、検証証跡） |
| Member / Team 管理（p.10） | グループ権限 `marketing.*`、外部権限の終了日必須 |
| セキュリティと継続運用（p.11） | 認証情報の暗号化・非表示、監査ログ、保存期間設定、SSRF 対策 |
| MVP の受入基準（p.13） | 経営・運用ダッシュボード（費用・媒体CV/CPA・GA4・LP、期間・定義・最終成功・未取得）、数値照合 |
| 成功指標（p.16） | 概要タイル（定時更新達成率・主副担当設定率・標準手順の承認率） |

GitHub の Organization / Team / ブランチ保護 / CODEOWNERS そのものの運用、MFA の必須化、
会社 IdP 連携は本機能の範囲外（認証基盤・GitHub 側の設定）。残課題は `plan/marketing-operations.md`。
