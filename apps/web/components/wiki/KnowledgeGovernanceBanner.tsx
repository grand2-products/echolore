"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { StatusDot } from "@/components/marketing/ui";
import { marketingApi, queryKeys } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";

/**
 * Shows the governance state of Wiki pages registered in the marketing
 * knowledge registry: status, owner/deputy, next review, and for
 * deprecated pages the successor (廃止表示と移行先).
 */
export function KnowledgeGovernanceBanner({ pageId }: { pageId: string }) {
  const t = useT();
  const { date } = useFormatters();
  const { data } = useQuery({
    queryKey: [...queryKeys.marketing, "governance", pageId],
    queryFn: () => marketingApi.pageGovernance(pageId),
    retry: false,
    staleTime: 60_000,
  });
  const g = data?.governance;
  if (!g) return null;

  if (g.status === "deprecated") {
    return (
      <div className="mb-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        <p className="flex items-center gap-1.5 font-medium">
          <StatusDot tone="red" />
          {t("marketing.banner.deprecated")}
        </p>
        {g.replacedByPageId ? (
          <p className="mt-1">
            {t("marketing.banner.movedTo")}{" "}
            <Link href={`/wiki/${g.replacedByPageId}`} className="font-medium underline">
              {g.replacedByPageTitle ?? g.replacedByPageId}
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  const tone =
    g.reviewOverdue || g.changedSinceApproval
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : g.status === "approved"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-gray-200 bg-gray-50 text-gray-700";

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 border px-3 py-2 text-xs ${tone}`}
    >
      <span className="font-medium">
        {t(`marketing.docStatus.${g.status}`)}
        <span className="ml-2 font-normal">{t(`marketing.layers.${g.layer}`)}</span>
      </span>
      <span>
        {t("marketing.knowledge.fields.owner")}: {g.ownerName ?? "—"}
        <span className="ml-3">
          {t("marketing.knowledge.fields.deputy")}: {g.deputyName ?? "—"}
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        {g.reviewOverdue ? <StatusDot tone="red" /> : null}
        {t("marketing.knowledge.nextReview")}: {g.nextReviewAt ? date(g.nextReviewAt) : "—"}
      </span>
      {g.approvedAt ? (
        <span>
          {t("marketing.knowledge.fields.approvedBy")}: {g.approvedByName ?? "—"} (
          {date(g.approvedAt)})
        </span>
      ) : null}
      {g.changedSinceApproval ? (
        <span className="inline-flex items-center gap-1.5">
          <StatusDot />
          {t("marketing.knowledge.changedSinceApproval")}
        </span>
      ) : null}
    </div>
  );
}
