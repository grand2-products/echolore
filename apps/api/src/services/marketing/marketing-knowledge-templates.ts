import {
  MARKETING_METRICS,
  type MarketingDocType,
  type MarketingKnowledgeLayer,
} from "@echolore/shared/contracts";

/**
 * Initial Wiki tree for marketing knowledge (ナレッジ体系). Content is a
 * starting point that teams edit in the Wiki; it is generated once by the
 * bootstrap endpoint and never overwritten.
 */

export interface KnowledgeTemplatePage {
  key: string;
  title: string;
  layer: MarketingKnowledgeLayer;
  docType: MarketingDocType;
  reviewIntervalDays: number;
  purpose: string;
  markdown: string;
  children?: KnowledgeTemplatePage[];
}

const COMMON_HEADER = `| 管理項目 | 内容 |
| --- | --- |
| 目的 | （記入） |
| 対象範囲 | （記入） |
| 責任者 / 副担当 | マーケティング画面の「ナレッジ」で設定 |
| 状態 | 下書き / 承認済み / 廃止（マーケティング画面で管理） |
| 次回見直し日 | マーケティング画面で管理 |
| 関連資産・変更 | （資産台帳・変更管理の項目名を記入） |
| 注意事項 | （記入） |`;

export const METRIC_LABELS_JA: Record<string, { label: string; description: string }> = {
  cost: {
    label: "費用",
    description: "媒体が請求する広告費（税・手数料の扱いはアカウント設定に従う）",
  },
  impressions: { label: "表示回数", description: "広告が表示された回数" },
  clicks: {
    label: "クリック",
    description: "Meta はリンククリック（設定で全クリックに変更可）、Google 広告はクリック",
  },
  conversions: {
    label: "媒体CV",
    description: "各媒体の計測によるコンバージョン数。媒体間で合算しない",
  },
  conversion_value: {
    label: "媒体CV値",
    description: "各媒体が帰属させたコンバージョン価値。媒体間で合算しない",
  },
  sessions: { label: "セッション", description: "GA4 のセッション数（ランディングページ別）" },
  lp_views: { label: "LP到達", description: "対象 LP パスの表示回数（GA4 screenPageViews）" },
  form_starts: { label: "フォーム開始", description: "フォーム開始イベント数（既定 form_start）" },
  form_submits: {
    label: "フォーム完了",
    description: "フォーム送信イベント数（既定 form_submit）",
  },
  key_events: { label: "GA4キーイベント", description: "GA4 のキーイベント数。媒体CVとは別指標" },
  inquiries: {
    label: "問い合わせ",
    description: "確認可能な問い合わせ数（中間成果）。CSV 等で取込",
  },
  revenue: { label: "売上", description: "営業等の責任者が正本と連携方法を決めた売上" },
  uptime_checks: { label: "稼働点検回数", description: "LP 監視の実行回数" },
  uptime_successes: {
    label: "稼働点検成功",
    description: "HTTP・タグ・フォームの点検に合格した回数",
  },
  response_ms_total: { label: "応答時間合計", description: "LP 監視の応答時間の合計（ミリ秒）" },
  ctr: { label: "CTR", description: "クリック ÷ 表示回数" },
  cpc: { label: "CPC", description: "費用 ÷ クリック" },
  cpa: { label: "媒体CPA", description: "費用 ÷ 媒体CV（媒体別に算出）" },
  cvr: { label: "CVR", description: "フォーム完了 ÷ セッション" },
  form_completion_rate: { label: "フォーム完了率", description: "フォーム完了 ÷ フォーム開始" },
  roas: { label: "ROAS", description: "同じ帰属条件の媒体CV値 ÷ 費用（媒体別に算出）" },
  availability: { label: "稼働率", description: "稼働点検成功 ÷ 稼働点検回数" },
  avg_response_ms: { label: "平均応答時間", description: "応答時間合計 ÷ 稼働点検回数" },
};

function kpiDictionaryMarkdown(): string {
  const rows = MARKETING_METRICS.map((m) => {
    const ja = METRIC_LABELS_JA[m.key];
    const formula = m.kind === "derived" ? `${m.numerator} ÷ ${m.denominator}` : "合計";
    const summable = m.summableAcrossSources ? "可" : "不可（媒体別に表示）";
    return `| ${ja?.label ?? m.key} | \`${m.key}\` | ${formula} | ${summable} | ${ja?.description ?? ""} |`;
  });
  return `# KPI辞書

ダッシュボードの全指標はこの定義で計算する。比率は「合計 ÷ 合計」で算出し、日別比率の平均は使わない。分母が 0 の場合は「算定不可」と表示する。

${COMMON_HEADER}

## 指標一覧

| 指標 | キー | 計算 | 媒体間の合算 | 定義 |
| --- | --- | --- | --- | --- |
${rows.join("\n")}

## 統合キー

- 広告日次の基本キー: 日付・媒体・広告アカウントID・キャンペーンID
- LP 側: 日付・LP（ページパス）・参照元。承認済み対応表で必要な粒度へ集約してから結合する
- 日付は各アカウント・プロパティの時刻帯で記録する

## 数字が一致しない場合の扱い

- Meta CV、Google 広告 CV、GA4 キーイベントは別の指標として表示し、単純合算しない
- 比較には期間・イベント・帰属・同意・集計方法の違いを添える
- 未取得の日はゼロとして扱わない（ダッシュボードに「未取得」と表示される）
- 元画面との照合はマーケティング画面の「数値照合」に記録し、差異理由と承認を残す
`;
}

export const KNOWLEDGE_TEMPLATE: KnowledgeTemplatePage = {
  key: "root",
  title: "マーケティング運用ナレッジ",
  layer: "policy",
  docType: "general",
  reviewIntervalDays: 90,
  purpose: "マーケティング運用の入口。必要な答えを3回以内の移動で探せることを品質基準とする",
  markdown: `# マーケティング運用ナレッジ

運用状況と判断根拠を会社が把握し、担当者が交代しても同じ業務を続けられる状態をつくるための入口ページ。

${COMMON_HEADER}

## 構成

| 階層 | 主な文書 | 更新責任・契機 |
| --- | --- | --- |
| 01 方針 | 事業目標、顧客像、訴求、予算方針、運用範囲 | 業務責任者 / 四半期・方針変更時 |
| 02 資産・権限 | アカウント一覧、LP一覧、関連ID、契約・請求、主副担当 | 運用＋情シス / 追加・異動・月次点検 |
| 03 計測・データ | KPI辞書、イベント設計、UTM、対応表、データ更新仕様 | 運用＋技術 / 計測・指標変更時 |
| 04 標準手順 | 日次・週次・月次業務、出稿、停止、タグ・LP公開、復旧 | 運用＋技術 / 実行後の改善時 |
| 05 施策・判断 | 仮説、対象、変更点、承認、結果、考察、次の判断 | 施策担当 / 着手時・終了時 |
| 06 教育・継承 | 入門、FAQ、用語、演習、引継ぎチェック、連絡先 | 業務責任者 / 教育後・質問発生時 |

## 正本の考え方

- 文書・手順・判断記録の正本はこの Wiki。各ページの状態（下書き・承認済み・廃止）、責任者、次回見直し日はマーケティング画面の「ナレッジ」で管理する
- 実績データの正本はマーケティング画面のデータ基盤（コネクター）。各媒体の公開中設定の正本は各サービス
- ダッシュボードから各指標の根拠（このWikiのページ・元画面）へ移動できるようにする
- 認証情報（トークン・パスワード）はWikiに書かない。資産台帳には保管庫の参照先のみを記録する

## 共通の変更フロー

課題 → 変更提案 → レビュー → 承認 → 実施 → 検証 → 完了。マーケティング画面の「変更管理」で記録する。作成者と承認者は分ける。口頭の判断は会議後に変更管理へ残す。

## 主要事項のRACI

| 事項 | 経営 | 業務責任者 | 運用 | 技術 | 情シス |
| --- | --- | --- | --- | --- | --- |
| 広告予算・施策承認 | I | A | R | C | I |
| KPI・計測仕様変更 | I | A | R | R | C |
| 連携・配備・復旧 | I | A | C | R | C |
| 権限・機密管理 | I | C | I | R | A |
| フェーズ移行・予算追加 | A | R | C | C | C |

A：最終責任・承認、R：実行、C：協議、I：報告。緊急時の代行者と連絡先は資産台帳に紐付ける。
`,
  children: [
    {
      key: "policy",
      title: "01 方針",
      layer: "policy",
      docType: "general",
      reviewIntervalDays: 90,
      purpose: "事業目標・顧客像・訴求・予算方針・運用範囲を定める",
      markdown: `# 01 方針

${COMMON_HEADER}

## 事業目標

（四半期ごとの目標と、広告・事業指標の目標値を記入）

## 顧客像・訴求

（対象顧客、主要な訴求軸を記入）

## 予算方針

- 月額上限と追加承認の基準：（記入）
- 予算消化の確認頻度：週次（業務責任者＋運用）

## 運用範囲

- 内製化の範囲は「意思決定・知識・管理責任の社内保有」を基本とする
- 自動入札・自動予算変更・自動公開は行わない。広告変更・タグ公開・LP公開は人が承認する
`,
    },
    {
      key: "assets",
      title: "02 資産・権限",
      layer: "assets",
      docType: "procedure",
      reviewIntervalDays: 30,
      purpose: "資産台帳と権限付与・剥奪の標準手順",
      markdown: `# 02 資産・権限

資産の一覧そのものはマーケティング画面の「資産台帳」が正本。このページは運用ルールを定める。

${COMMON_HEADER}

## 資産台帳に必ず持たせる項目

サービス名／アカウント・プロパティ・コンテナID／利用目的／所有主体／請求主体／主担当・副担当／権限一覧／代理店との契約・共有関係／関連LP・計測ID／最終確認日／管理画面URL。認証秘密は台帳へ記載せず、保管庫の参照先のみを残す。

## 権限ロール（グループ権限）

| 想定チーム | 付与するグループ権限 | 利用と制約 |
| --- | --- | --- |
| marketing-viewers | marketing.view | 役員・関係部署。承認済み文書・画面を参照、課題の起票 |
| marketing-operators | marketing.operate | 演習修了者。台帳・ダッシュボード・変更提案・CSV取込 |
| marketing-reviewers | marketing.review | 業務・計測のレビュー担当。自分の変更は承認できない |
| platform-maintainers | marketing.manage | コネクター・認証情報・保存期間の保守 |

## 入社・異動・退職の標準手順

1. 申請
2. 上長・資産責任者の承認
3. 認証設定（多要素認証）
4. グループ／各サービスの権限付与
5. 到達確認を記録（資産台帳の権限一覧に追記）

異動時は旧権限を見直し、退職・契約終了時は最終稼働日までにアクセス・セッション・個人トークンを失効させる。共有秘密に接触した場合は更新し、月次に台帳と実権限を照合する（資産台帳の「確認済みにする」）。外部委託先は承認者・終了日・対象を記録する。
`,
    },
    {
      key: "measurement",
      title: "03 計測・データ",
      layer: "measurement",
      docType: "general",
      reviewIntervalDays: 90,
      purpose: "計測仕様・データ更新仕様・UTM規約",
      markdown: `# 03 計測・データ

${COMMON_HEADER}

## データ更新仕様

- 広告は媒体API、GA4 は Data API で日次集計。直近7日（コネクターの再取得日数）を日次で再取得し、遅延CVの再計上に備える
- API利用承認に時間を要する場合は、権限者のCSV出力を同じ定義で取込む
- 取得件数・重複キー・欠損・負値・最終成功時刻は自動確認され、各コネクターの取得履歴に残る
- 月次確定時に元画面と照合し、差分理由を「数値照合」に保存する

## UTM命名規約

| パラメータ | 規約 | 例 |
| --- | --- | --- |
| utm_source | 媒体名（小文字） | facebook / google |
| utm_medium | 種別 | cpc / paid_social |
| utm_campaign | キャンペーンID_略称 | 1234_spring |
| utm_content | 広告ID | （記入） |

## 対応表

広告ID・LP対応表、GTMタグとGA4イベントの対応表をこのページの子ページで版管理する。GTM は計測設定を管理するものであり、成果集計の正本にはしない。
`,
      children: [
        {
          key: "kpi",
          title: "KPI辞書",
          layer: "measurement",
          docType: "general",
          reviewIntervalDays: 90,
          purpose: "全ダッシュボード共通の指標定義",
          markdown: kpiDictionaryMarkdown(),
        },
      ],
    },
    {
      key: "procedure",
      title: "04 標準手順",
      layer: "procedure",
      docType: "procedure",
      reviewIntervalDays: 90,
      purpose: "日次・週次・月次業務と変更・復旧の手順",
      markdown: `# 04 標準手順

${COMMON_HEADER}

## 定常業務

| 頻度 | 担当と確認内容 | 記録・判断 |
| --- | --- | --- |
| 日次 | 運用担当：更新状態、費用進捗、異常値、LP・フォーム・主要イベント | 異常は変更管理（障害）に起票。重大障害は連絡経路へ即時報告 |
| 週次 | 業務責任者＋運用：予算消化、CPA、LP行動、進行施策、計測不整合 | 継続・停止・改善の理由と担当・期限を記録 |
| 月次 | 業務責任者＋経営：月次再集計、成果・費用、改善の効果、権限と文書の点検 | 次月予算、施策配分、リスク・フェーズ進行を承認 |

## 変更の種類と承認・検証の条件

| 変更の種類 | 承認・検証の条件 |
| --- | --- |
| 広告の新規出稿・予算・停止 | 業務責任者が予算・期間・停止条件を承認。媒体管理画面で実施し、日時・変更前後・実施者を記録 |
| GTM・GA4設定 | 計測仕様を運用担当が確認、技術担当がプレビュー等で検証。公開権限者が本番反映し、公開版を記録 |
| LP・ダッシュボード | 検証環境で表示・リンク・フォーム・計測・認証を確認。公開後に再確認し、問題時は直前版へ戻す |
| 緊急対応 | 停止・復旧の代行者を事前指定。影響縮小を優先し、翌営業日までに事後レビュー・判断記録を作成 |

重大度の初期基準：予算超過・LP停止・フォーム不通・情報露出は重大。データ収集停止は表示に警告が出るため技術担当へ通知し、媒体の一次画面で運用を継続する。
`,
      children: [
        {
          key: "procedure-template",
          title: "手順書テンプレート",
          layer: "procedure",
          docType: "procedure",
          reviewIntervalDays: 90,
          purpose: "手順書の標準形",
          markdown: `# 手順書テンプレート

このページを複製して手順書を作成する。

${COMMON_HEADER}

## 目的と前提権限

（この手順で達成すること、必要な権限）

## 実行手順・期待結果

1. （手順）— 期待結果：（記入）

## 検証・証跡

（確認方法、スクリーンショット・ログの保存先）

## 失敗時の戻し方

（ロールバック手順）

## 主担当・代行者

（担当者名）
`,
        },
      ],
    },
    {
      key: "initiative",
      title: "05 施策・判断",
      layer: "initiative",
      docType: "initiative",
      reviewIntervalDays: 90,
      purpose: "施策の仮説・結果・判断の記録",
      markdown: `# 05 施策・判断

施策記録と障害・判断記録をこのページの子ページとして残す。承認が必要な変更はマーケティング画面の「変更管理」と相互にリンクする。

${COMMON_HEADER}
`,
      children: [
        {
          key: "initiative-template",
          title: "施策記録テンプレート",
          layer: "initiative",
          docType: "initiative",
          reviewIntervalDays: 90,
          purpose: "施策記録の標準形",
          markdown: `# 施策記録テンプレート

${COMMON_HEADER}

## 課題・仮説・対象

## 予算・期間・評価指標

## 変更内容・承認

（変更管理の項目名と承認者）

## 結果と解釈

（ダッシュボードの期間・定義を明記）

## 継続・停止・次の検証
`,
        },
        {
          key: "incident-template",
          title: "障害・判断記録テンプレート",
          layer: "initiative",
          docType: "incident",
          reviewIntervalDays: 90,
          purpose: "障害・判断記録の標準形",
          markdown: `# 障害・判断記録テンプレート

${COMMON_HEADER}

## 発生日時・影響範囲

## 事実・原因・暫定対応

## 復旧・判断者

## 再発防止・担当・期限

## 関連リリースと根拠
`,
        },
      ],
    },
    {
      key: "enablement",
      title: "06 教育・継承",
      layer: "enablement",
      docType: "general",
      reviewIntervalDays: 90,
      purpose: "入門・研修・引継ぎ",
      markdown: `# 06 教育・継承

${COMMON_HEADER}

## 研修計画（1回90分 × 4）

| 時期 | 内容 | 演習と到達基準 |
| --- | --- | --- |
| W1 | 全体像、ログイン、Wiki・変更管理、正本、認証・秘密の扱い | 自分の担当手順を見つけ、課題を変更管理に起票できる |
| W2 | Wiki編集、変更提案、レビュー、履歴 | 手順を1か所修正し、理由付きで承認依頼。反映まで確認する |
| W3 | ダッシュボード、KPI辞書、更新遅延、媒体とGA4の差、LP・計測確認 | 数値の根拠を説明し、異常時の確認先と報告手順を選べる |
| W4 | 週次報告、施策記録、引継ぎ、誤更新の戻し方 | 副担当として週次業務と文書更新を実施し、評価表で合格する |

## 知識を属人化させない仕組み

主担当と副担当を月1回交代する。引継ぎ演習で迷った箇所をその場で手順へ反映する。

## 引継ぎチェック

- [ ] 担当資産の主副担当・連絡先が資産台帳に記録されている
- [ ] 認証情報の所在（保管庫の参照先）を確認した
- [ ] 日次・週次手順を副担当が手順だけで実行できた
- [ ] 未完了の変更・障害記録を引き継いだ

## FAQ

（よくある質問を追記）
`,
    },
  ],
};
