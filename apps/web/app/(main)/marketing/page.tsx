"use client";

import type { MarketingOverviewDto } from "@echolore/shared/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { DashboardView } from "@/components/marketing/DashboardView";
import {
  Button,
  buttonClass,
  EmptyState,
  loadingPanelClass,
  Notice,
  StatusDot,
  useAction,
} from "@/components/marketing/ui";
import { ErrorBanner } from "@/components/ui";
import { marketingApi, queryKeys } from "@/lib/api";
import { useMarketingAccess } from "@/lib/hooks/use-marketing-access";
import { useT } from "@/lib/i18n";

function ratio(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

function HealthTile({
  label,
  value,
  detail,
  warn,
  href,
  className = "",
}: {
  label: string;
  value: string;
  detail: string;
  warn?: boolean;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`block min-w-0 bg-white px-3 py-3 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 ${className}`}
    >
      <p className="text-[11px] leading-4 text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-gray-900">
        {value}
      </p>
      <p
        className={`mt-1 flex items-start gap-1.5 text-[11px] leading-4 ${warn ? "text-amber-800" : "text-gray-500"}`}
      >
        {warn ? <StatusDot /> : <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0" />}
        <span>{detail}</span>
      </p>
    </Link>
  );
}

/** Operating-health figures from the plan's success metrics. */
function HealthTiles({ overview }: { overview: MarketingOverviewDto }) {
  const t = useT();
  const { connectors, assets, knowledge, changes, reconciliations } = overview;
  return (
    <div className="mb-4 grid grid-cols-1 gap-px border border-gray-200 bg-gray-200 sm:grid-cols-2 lg:grid-cols-5">
      <HealthTile
        label={t("marketing.overview.updateRate")}
        value={
          connectors.updateSuccessRate === null
            ? "—"
            : `${Math.round(connectors.updateSuccessRate * 100)}%`
        }
        detail={t("marketing.overview.connectorsDetail", {
          healthy: connectors.healthy,
          stale: connectors.stale,
          failing: connectors.failing,
        })}
        warn={connectors.stale > 0 || connectors.failing > 0}
        href="/marketing/connectors"
      />
      <HealthTile
        label={t("marketing.overview.ownership")}
        value={ratio(assets.withOwnerAndDeputy, assets.total)}
        detail={t("marketing.overview.assetsDetail", {
          overdue: assets.verificationOverdue,
          expired: assets.expiredAccess,
        })}
        warn={assets.verificationOverdue > 0 || assets.expiredAccess > 0}
        href="/marketing/assets"
      />
      <HealthTile
        label={t("marketing.overview.procedures")}
        value={ratio(knowledge.procedureApproved, knowledge.procedureTotal)}
        detail={t("marketing.overview.knowledgeDetail", {
          approved: knowledge.approved,
          total: knowledge.total,
          overdue: knowledge.reviewOverdue,
        })}
        warn={knowledge.reviewOverdue > 0}
        href="/marketing/knowledge"
      />
      <HealthTile
        label={t("marketing.overview.changes")}
        value={String(changes.open)}
        detail={t("marketing.overview.changesDetail", {
          awaiting: changes.awaitingApproval,
          overdue: changes.postReviewOverdue,
        })}
        warn={changes.postReviewOverdue > 0}
        href="/marketing/changes"
      />
      <HealthTile
        label={t("marketing.overview.reconciliations")}
        value={String(reconciliations.pending)}
        detail={t("marketing.overview.reconciliationsDetail")}
        warn={reconciliations.pending > 0}
        href="/marketing/reconciliations"
        className="sm:col-span-2 lg:col-span-1"
      />
    </div>
  );
}

export default function MarketingOverviewPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const { can } = useMarketingAccess();
  const action = useAction();
  const overview = useQuery({
    queryKey: [...queryKeys.marketing, "overview"],
    queryFn: () => marketingApi.overview(),
  });
  const settings = useQuery({
    queryKey: [...queryKeys.marketing, "settings"],
    queryFn: () => marketingApi.getSettings(),
  });
  const dashboards = useQuery({
    queryKey: [...queryKeys.marketing, "dashboards"],
    queryFn: () => marketingApi.listDashboards(),
  });

  const defaultDashboard =
    dashboards.data?.find((d) => d.id === settings.data?.defaultDashboardId) ??
    dashboards.data?.[0];

  const createFromTemplate = () =>
    action.run(async () => {
      await marketingApi.createDashboardFromTemplate();
      await queryClient.invalidateQueries({ queryKey: queryKeys.marketing });
    });

  return (
    <div>
      {overview.error ? (
        <ErrorBanner
          message={t("marketing.common.loadFailed")}
          onRetry={() => void overview.refetch()}
          className="mb-4"
        />
      ) : null}
      {overview.data ? <HealthTiles overview={overview.data} /> : null}

      {settings.data && !settings.data.knowledgeRootPageId && can("marketing.manage") ? (
        <div className="mb-4">
          <Notice tone="info">
            {t("marketing.overview.knowledgeNotSetUp")}{" "}
            <Link href="/marketing/knowledge" className="font-medium underline">
              {t("marketing.overview.setUpKnowledge")}
            </Link>
          </Notice>
        </div>
      ) : null}

      {action.error ? <ErrorBanner message={action.error} className="mb-4" /> : null}

      {dashboards.isLoading ? (
        <div className={`h-40 ${loadingPanelClass}`} />
      ) : defaultDashboard ? (
        <DashboardView
          key={defaultDashboard.id}
          dashboard={defaultDashboard}
          actions={
            <Link
              href={`/marketing/dashboards/${defaultDashboard.id}`}
              className={buttonClass("secondary", "sm")}
            >
              {t("marketing.dashboards.open")}
            </Link>
          }
        />
      ) : (
        <EmptyState
          title={t("marketing.dashboards.emptyTitle")}
          description={t("marketing.dashboards.emptyDescription")}
          action={
            can("marketing.operate") ? (
              <Button
                variant="primary"
                onClick={() => void createFromTemplate()}
                disabled={action.pending}
              >
                {t("marketing.dashboards.createFromTemplate")}
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
