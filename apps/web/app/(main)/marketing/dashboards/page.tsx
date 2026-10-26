"use client";

import type { MarketingDashboardExport } from "@echolore/shared/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Button, EmptyState, PageHeader, Pill, useAction } from "@/components/marketing/ui";
import { ErrorBanner } from "@/components/ui";
import { marketingApi, queryKeys } from "@/lib/api";
import { useMarketingAccess } from "@/lib/hooks/use-marketing-access";
import { useFormatters, useT } from "@/lib/i18n";

export default function MarketingDashboardsPage() {
  const t = useT();
  const router = useRouter();
  const { dateTime } = useFormatters();
  const queryClient = useQueryClient();
  const { can } = useMarketingAccess();
  const action = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...queryKeys.marketing, "dashboards"],
    queryFn: () => marketingApi.listDashboards(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.marketing });

  const create = () =>
    action.run(async () => {
      const dashboard = await marketingApi.createDashboard({
        name: t("marketing.dashboards.untitled"),
        description: null,
        wikiPageId: null,
        defaultRange: "last_28_days",
        widgets: [],
      });
      await refresh();
      router.push(`/marketing/dashboards/${dashboard.id}?edit=1`);
    });

  const fromTemplate = () =>
    action.run(async () => {
      const dashboard = await marketingApi.createDashboardFromTemplate();
      await refresh();
      router.push(`/marketing/dashboards/${dashboard.id}`);
    });

  const importFile = (file: File) =>
    action.run(async () => {
      const parsed = JSON.parse(await file.text()) as MarketingDashboardExport;
      const dashboard = await marketingApi.importDashboard(parsed);
      await refresh();
      router.push(`/marketing/dashboards/${dashboard.id}`);
    });

  const setDefault = (id: string) =>
    action.run(async () => {
      await marketingApi.updateSettings({ defaultDashboardId: id });
      await refresh();
    });

  return (
    <div>
      <PageHeader
        title={t("marketing.dashboards.title")}
        description={t("marketing.dashboards.description")}
        actions={
          can("marketing.operate") ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                  e.target.value = "";
                }}
              />
              <Button onClick={() => fileRef.current?.click()} disabled={action.pending}>
                {t("marketing.dashboards.importJson")}
              </Button>
              <Button onClick={() => void fromTemplate()} disabled={action.pending}>
                {t("marketing.dashboards.createFromTemplate")}
              </Button>
              <Button variant="primary" onClick={() => void create()} disabled={action.pending}>
                + {t("marketing.dashboards.create")}
              </Button>
            </>
          ) : undefined
        }
      />
      {action.error ? <ErrorBanner message={action.error} className="mb-4" /> : null}
      {error ? (
        <ErrorBanner message={t("marketing.common.loadFailed")} onRetry={() => void refetch()} />
      ) : null}
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-white" />
      ) : !data?.length ? (
        <EmptyState
          title={t("marketing.dashboards.emptyTitle")}
          description={t("marketing.dashboards.emptyDescription")}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.map((d) => (
            <div
              key={d.id}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/marketing/dashboards/${d.id}`}
                  className="font-medium text-gray-900 hover:underline"
                >
                  {d.name}
                </Link>
                {d.isDefault ? <Pill tone="blue">{t("marketing.dashboards.default")}</Pill> : null}
              </div>
              {d.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-gray-600">{d.description}</p>
              ) : null}
              <p className="mt-2 text-xs text-gray-500">
                {t("marketing.dashboards.release", { version: d.version })} ·{" "}
                {t("marketing.dashboards.widgetCount", { count: d.widgets.length })} ·{" "}
                {dateTime(d.updatedAt)}
                {d.updatedByName ? ` · ${d.updatedByName}` : ""}
              </p>
              {can("marketing.manage") && !d.isDefault ? (
                <div className="mt-3">
                  <Button size="sm" onClick={() => void setDefault(d.id)} disabled={action.pending}>
                    {t("marketing.dashboards.makeDefault")}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
