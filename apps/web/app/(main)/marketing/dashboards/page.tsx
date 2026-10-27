"use client";

import type { MarketingDashboardExport } from "@echolore/shared/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import {
  Button,
  EmptyState,
  loadingPanelClass,
  PageHeader,
  Pill,
  tableWrapClass,
  useAction,
} from "@/components/marketing/ui";
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
        <div className={`h-32 ${loadingPanelClass}`} />
      ) : !data?.length ? (
        <EmptyState
          title={t("marketing.dashboards.emptyTitle")}
          description={t("marketing.dashboards.emptyDescription")}
        />
      ) : (
        <div className={tableWrapClass}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-medium text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">{t("marketing.editor.name")}</th>
                <th className="px-3 py-2 font-medium">{t("marketing.dashboards.default")}</th>
                <th className="px-3 py-2 font-medium">{t("marketing.changes.fields.updatedAt")}</th>
                <th className="px-3 py-2 font-medium">
                  <span className="sr-only">{t("marketing.dashboards.makeDefault")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-t border-gray-100 align-top hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/marketing/dashboards/${d.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {d.name}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
                      <span>{t("marketing.dashboards.release", { version: d.version })}</span>
                      <span>
                        {t("marketing.dashboards.widgetCount", { count: d.widgets.length })}
                      </span>
                    </p>
                    {d.description ? (
                      <p className="mt-0.5 line-clamp-1 max-w-xl text-xs text-gray-500">
                        {d.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {d.isDefault ? (
                      <Pill tone="blue">{t("marketing.dashboards.default")}</Pill>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-700">
                    <div className="tabular-nums">{dateTime(d.updatedAt)}</div>
                    {d.updatedByName ? (
                      <div className="text-gray-500">{d.updatedByName}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {can("marketing.manage") && !d.isDefault ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void setDefault(d.id)}
                        disabled={action.pending}
                      >
                        {t("marketing.dashboards.makeDefault")}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
