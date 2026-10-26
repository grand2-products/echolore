"use client";

import type {
  MarketingChangeStatus,
  MarketingDocStatus,
  MarketingRunStatus,
  MarketingWidgetDto,
} from "@echolore/shared/contracts";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { marketingApi, queryKeys } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";
import { ExternalLink, Pill, useMarketingAssets, WikiLink } from "./ui";

const RUN_TONE: Record<MarketingRunStatus, "green" | "amber" | "red" | "blue"> = {
  success: "green",
  partial: "amber",
  failed: "red",
  running: "blue",
};

export const CHANGE_STATUS_TONE: Record<
  MarketingChangeStatus,
  "gray" | "blue" | "green" | "amber" | "red" | "violet"
> = {
  open: "gray",
  in_review: "amber",
  approved: "blue",
  rejected: "red",
  implemented: "violet",
  verified: "green",
  closed: "gray",
};

export const DOC_STATUS_TONE: Record<MarketingDocStatus, "gray" | "green" | "red"> = {
  draft: "gray",
  approved: "green",
  deprecated: "red",
};

export function RunStatusPill({ status }: { status: MarketingRunStatus | null }) {
  const t = useT();
  if (!status) return <Pill tone="gray">{t("marketing.runStatus.none")}</Pill>;
  return <Pill tone={RUN_TONE[status]}>{t(`marketing.runStatus.${status}`)}</Pill>;
}

export function useConnectorsQuery() {
  return useQuery({
    queryKey: [...queryKeys.marketing, "connectors"],
    queryFn: () => marketingApi.listConnectors(),
  });
}

export function FreshnessWidget() {
  const t = useT();
  const { dateTime } = useFormatters();
  const { data, isLoading } = useConnectorsQuery();
  if (isLoading) return <div className="h-16 animate-pulse rounded bg-gray-50" />;
  if (!data?.length)
    return <p className="text-sm text-gray-500">{t("marketing.connectors.empty")}</p>;
  return (
    <ul className="space-y-2">
      {data.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-gray-800">{c.name}</span>
          <span className="flex items-center gap-2">
            {c.stale ? <Pill tone="amber">⚠ {t("marketing.connectors.stale")}</Pill> : null}
            <RunStatusPill status={c.lastStatus} />
          </span>
          <span className="w-full text-xs text-gray-500">
            {t("marketing.connectors.lastSuccess")}:{" "}
            {c.lastSuccessAt ? dateTime(c.lastSuccessAt) : t("marketing.common.never")}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AssetsWidget({ widget }: { widget: MarketingWidgetDto }) {
  const t = useT();
  const { data, isLoading } = useMarketingAssets();
  if (isLoading) return <div className="h-16 animate-pulse rounded bg-gray-50" />;
  const assets = (data ?? []).filter((a) => a.status !== "retired").slice(0, widget.limit ?? 8);
  if (assets.length === 0)
    return <p className="text-sm text-gray-500">{t("marketing.assets.empty")}</p>;
  return (
    <ul className="space-y-2">
      {assets.map((a) => (
        <li key={a.id} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/marketing/assets?asset=${a.id}`}
              className="truncate text-gray-900 hover:underline"
            >
              {a.name}
            </Link>
            {a.verificationOverdue ? (
              <Pill tone="amber">{t("marketing.assets.verifyDue")}</Pill>
            ) : null}
          </div>
          <p className="text-xs text-gray-500">
            {t(`marketing.assetTypes.${a.type}`)} · {t("marketing.assets.primary")}:{" "}
            {a.primaryOwnerName ?? "—"} / {t("marketing.assets.secondary")}:{" "}
            {a.secondaryOwnerName ?? "—"}
          </p>
        </li>
      ))}
    </ul>
  );
}

const ACTIVE_CHANGE_STATUSES = ["open", "in_review", "approved", "implemented", "verified"];

export function ChangesWidget({ widget }: { widget: MarketingWidgetDto }) {
  const t = useT();
  const { date } = useFormatters();
  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.marketing, "changes", "active"],
    queryFn: () => marketingApi.listChanges({ status: ACTIVE_CHANGE_STATUSES }),
  });
  if (isLoading) return <div className="h-16 animate-pulse rounded bg-gray-50" />;
  const items = (data ?? []).slice(0, widget.limit ?? 8);
  if (items.length === 0)
    return <p className="text-sm text-gray-500">{t("marketing.changes.emptyActive")}</p>;
  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={c.id} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/marketing/changes/${c.id}`}
              className="truncate text-gray-900 hover:underline"
            >
              {c.title}
            </Link>
            <Pill tone={CHANGE_STATUS_TONE[c.status]}>
              {t(`marketing.changeStatus.${c.status}`)}
            </Pill>
          </div>
          <p className="text-xs text-gray-500">
            {t(`marketing.changeTypes.${c.type}`)} · {c.requestedByName ?? "—"} ·{" "}
            {date(c.updatedAt)}
            {c.postReviewOverdue ? (
              <span className="ml-1 text-red-700">
                · {t("marketing.changes.postReviewOverdue")}
              </span>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function ReviewsWidget({ widget }: { widget: MarketingWidgetDto }) {
  const t = useT();
  const { date } = useFormatters();
  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.marketing, "knowledge"],
    queryFn: () => marketingApi.listKnowledge(),
  });
  if (isLoading) return <div className="h-16 animate-pulse rounded bg-gray-50" />;
  const items = (data ?? [])
    .filter((k) => k.status !== "deprecated" && k.nextReviewAt)
    .sort((a, b) => (a.nextReviewAt ?? "").localeCompare(b.nextReviewAt ?? ""))
    .slice(0, widget.limit ?? 8);
  if (items.length === 0)
    return <p className="text-sm text-gray-500">{t("marketing.knowledge.empty")}</p>;
  return (
    <ul className="space-y-2">
      {items.map((k) => (
        <li key={k.id} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/wiki/${k.pageId}`} className="truncate text-gray-900 hover:underline">
              {k.pageTitle ?? "—"}
            </Link>
            <Pill tone={DOC_STATUS_TONE[k.status]}>{t(`marketing.docStatus.${k.status}`)}</Pill>
          </div>
          <p className={`text-xs ${k.reviewOverdue ? "text-red-700" : "text-gray-500"}`}>
            {k.reviewOverdue ? "⚠ " : ""}
            {t("marketing.knowledge.nextReview")}: {k.nextReviewAt ? date(k.nextReviewAt) : "—"} ·{" "}
            {k.ownerName ?? "—"}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function LinksWidget({ widget }: { widget: MarketingWidgetDto }) {
  const t = useT();
  const links = widget.links ?? [];
  if (links.length === 0 && !widget.wikiPageId) {
    return <p className="text-sm text-gray-500">{t("marketing.widgets.noLinks")}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {links.map((l) => (
        <li key={`${l.label}-${l.url}`}>
          <ExternalLink href={l.url}>{l.label}</ExternalLink>
        </li>
      ))}
    </ul>
  );
}

export function NoteWidget({ widget }: { widget: MarketingWidgetDto }) {
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{widget.text}</p>;
}

export { WikiLink };
