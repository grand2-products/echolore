import type { MarketingDashboardDefinition } from "@echolore/shared/contracts";

/**
 * Starter "経営・運用ダッシュボード". It answers the questions the MVP
 * screen must answer: how much was spent and where results come from,
 * where LP visitors drop off, when data was updated, who approves changes,
 * and where procedures and past decisions live.
 */
export function buildDefaultDashboard(wikiPageId: string | null): MarketingDashboardDefinition {
  return {
    name: "経営・運用ダッシュボード",
    description: "費用・媒体CV/CPA・GA4の集客と主要イベント・LPを横断して確認する",
    wikiPageId,
    defaultRange: "this_month",
    widgets: [
      {
        id: "kpi-main",
        type: "kpi",
        title: "主要指標",
        width: 3,
        metrics: ["cost", "conversions", "cpa", "sessions", "key_events", "cvr"],
        compare: true,
      },
      {
        id: "ts-cost",
        type: "timeseries",
        title: "費用と媒体CV（日次）",
        width: 2,
        metrics: ["cost", "conversions"],
        filters: { sources: ["meta_ads", "google_ads"] },
      },
      { id: "freshness", type: "freshness", title: "データ更新状況", width: 1 },
      {
        id: "campaigns",
        type: "breakdown",
        title: "キャンペーン別の成果",
        width: 3,
        dimension: "campaign",
        metrics: ["cost", "impressions", "clicks", "ctr", "conversions", "cpa"],
        filters: { sources: ["meta_ads", "google_ads"] },
        limit: 20,
      },
      {
        id: "lp-funnel",
        type: "funnel",
        title: "LP別 到達 → フォーム開始 → 完了",
        width: 2,
        metrics: ["lp_views", "form_starts", "form_submits"],
        filters: { sources: ["ga4"] },
        limit: 10,
      },
      {
        id: "lp-health",
        type: "breakdown",
        title: "LP稼働状況",
        width: 1,
        dimension: "segment",
        metrics: ["availability", "avg_response_ms"],
        filters: { sources: ["lp_monitor"] },
        limit: 10,
      },
      { id: "changes", type: "changes", title: "承認待ち・進行中の変更", width: 1, limit: 8 },
      { id: "reviews", type: "reviews", title: "見直し期限が近い文書", width: 1, limit: 8 },
      { id: "assets", type: "assets", title: "資産と主副担当", width: 1, limit: 8 },
      {
        id: "rules",
        type: "note",
        title: "数値の読み方",
        width: 3,
        text:
          "Meta CV・Google広告CV・GA4キーイベントは定義が異なるため合算せず媒体別に表示します。" +
          "未取得の日はゼロではなく「未取得」と表示します。比率は合計÷合計で算出し、分母が0の場合は算定不可です。" +
          "定義の詳細はKPI辞書を参照してください。",
      },
    ],
  };
}
