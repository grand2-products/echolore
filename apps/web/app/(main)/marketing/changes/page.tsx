"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChangeForm } from "@/components/marketing/ChangeForm";
import { CHANGE_STATUS_TONE } from "@/components/marketing/ops-widgets";
import { Button, EmptyState, inputClass, PageHeader, Pill } from "@/components/marketing/ui";
import { ErrorBanner } from "@/components/ui";
import { marketingApi, queryKeys } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";

const STATUS_GROUPS = {
  active: ["open", "in_review", "approved", "implemented", "verified"],
  review: ["in_review"],
  done: ["closed", "rejected"],
  all: [] as string[],
};

export default function MarketingChangesPage() {
  const t = useT();
  const router = useRouter();
  const { date } = useFormatters();
  const queryClient = useQueryClient();
  const [group, setGroup] = useState<keyof typeof STATUS_GROUPS>("active");
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...queryKeys.marketing, "changes", group],
    queryFn: () => marketingApi.listChanges({ status: STATUS_GROUPS[group] }),
  });

  return (
    <div>
      <PageHeader
        title={t("marketing.changes.title")}
        description={t("marketing.changes.description")}
        actions={
          <>
            <select
              className={`${inputClass} w-auto`}
              value={group}
              onChange={(e) => setGroup(e.target.value as keyof typeof STATUS_GROUPS)}
            >
              {Object.keys(STATUS_GROUPS).map((g) => (
                <option key={g} value={g}>
                  {t(`marketing.changes.groups.${g}`)}
                </option>
              ))}
            </select>
            <Button variant="primary" onClick={() => setCreating(true)}>
              + {t("marketing.changes.create")}
            </Button>
          </>
        }
      />
      <p className="-mt-3 mb-4 text-xs text-gray-500">{t("marketing.changes.flow")}</p>
      {error ? (
        <ErrorBanner message={t("marketing.common.loadFailed")} onRetry={() => void refetch()} />
      ) : null}
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-white" />
      ) : !data?.length ? (
        <EmptyState title={t("marketing.changes.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">{t("marketing.changes.fields.title")}</th>
                <th className="px-4 py-2 font-medium">{t("marketing.changes.fields.type")}</th>
                <th className="px-4 py-2 font-medium">{t("marketing.changes.fields.status")}</th>
                <th className="px-4 py-2 font-medium">{t("marketing.changes.fields.asset")}</th>
                <th className="px-4 py-2 font-medium">
                  {t("marketing.changes.fields.requestedBy")}
                </th>
                <th className="px-4 py-2 font-medium">{t("marketing.changes.fields.updatedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/marketing/changes/${c.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {c.title}
                    </Link>
                    {c.postReviewOverdue ? (
                      <span className="ml-2">
                        <Pill tone="red">⚠ {t("marketing.changes.postReviewOverdue")}</Pill>
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    {t(`marketing.changeTypes.${c.type}`)}
                    {c.severity ? (
                      <span className="ml-1 text-xs text-gray-500">
                        ({t(`marketing.severity.${c.severity}`)})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    <Pill tone={CHANGE_STATUS_TONE[c.status]}>
                      {t(`marketing.changeStatus.${c.status}`)}
                    </Pill>
                  </td>
                  <td className="px-4 py-2">{c.assetName ?? "—"}</td>
                  <td className="px-4 py-2">{c.requestedByName ?? "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{date(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating ? (
        <ChangeForm
          changeId={null}
          initial={{ type: "budget_change", title: "" }}
          onClose={() => setCreating(false)}
          onSaved={(change) => {
            setCreating(false);
            void queryClient.invalidateQueries({ queryKey: queryKeys.marketing });
            router.push(`/marketing/changes/${change.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
