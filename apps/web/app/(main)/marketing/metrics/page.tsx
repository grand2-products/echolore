"use client";

import {
  isSummableAcrossSources,
  MARKETING_METRICS,
  type MarketingMetricGroup,
} from "@echolore/shared/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMarketingFormat } from "@/components/marketing/format";
import { Card } from "@/components/marketing/ui";
import { marketingApi, queryKeys } from "@/lib/api";
import { useT } from "@/lib/i18n";

const GROUPS: MarketingMetricGroup[] = ["acquisition", "site", "business", "ratio", "health"];

/** KPI辞書: the single definition every dashboard computes from. */
export default function MarketingMetricsPage() {
  const t = useT();
  const { metricLabel } = useMarketingFormat();
  const types = useQuery({
    queryKey: [...queryKeys.marketing, "connector-types"],
    queryFn: () => marketingApi.connectorTypes(),
  });
  const sourcesOf = (key: string) =>
    (types.data ?? [])
      .filter((x) => x.metrics.includes(key))
      .map((x) => t(`marketing.sources.${x.type}`));

  return (
    <div className="space-y-4">
      {GROUPS.map((group) => (
        <Card key={group} flush title={t(`marketing.metricGroups.${group}`)}>
          <div className="overflow-x-auto px-3">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500">
                <tr className="border-b border-gray-100 text-left">
                  <th className="py-1.5 pr-3 font-medium">{t("marketing.metricsPage.metric")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("marketing.metricsPage.key")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("marketing.metricsPage.formula")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("marketing.metricsPage.summable")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("marketing.metricsPage.sources")}</th>
                  <th className="py-1.5 font-medium">{t("marketing.metricsPage.definition")}</th>
                </tr>
              </thead>
              <tbody>
                {MARKETING_METRICS.filter((m) => m.group === group).map((m) => (
                  <tr key={m.key} className="border-b border-gray-50 align-top last:border-0">
                    <td className="py-2 pr-3 font-medium text-gray-900">{metricLabel(m.key)}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-gray-600">{m.key}</td>
                    <td className="py-2 pr-3 text-xs text-gray-700">
                      {m.kind === "derived" && m.numerator && m.denominator
                        ? `${metricLabel(m.numerator)} ÷ ${metricLabel(m.denominator)}`
                        : t("marketing.metricsPage.sum")}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {isSummableAcrossSources(m.key) ? (
                        t("marketing.metricsPage.yes")
                      ) : (
                        <span className="text-amber-800">
                          {t("marketing.metricsPage.perSource")}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-600">
                      {m.kind === "base" ? sourcesOf(m.key).join(", ") || "—" : "—"}
                    </td>
                    <td className="py-2 text-xs text-gray-700">
                      {t(`marketing.metrics.${m.key}.description`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
