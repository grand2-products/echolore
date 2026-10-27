"use client";

import type { MarketingDashboardDefinition } from "@echolore/shared/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardEditor } from "@/components/marketing/DashboardEditor";
import { DashboardView } from "@/components/marketing/DashboardView";
import {
  Button,
  Field,
  inputClass,
  loadingPanelClass,
  Modal,
  panelClass,
  useAction,
} from "@/components/marketing/ui";
import { ErrorBanner } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { marketingApi, queryKeys } from "@/lib/api";
import { useMarketingAccess } from "@/lib/hooks/use-marketing-access";
import { useFormatters, useT } from "@/lib/i18n";

function toDefinition(d: MarketingDashboardDefinition): MarketingDashboardDefinition {
  return {
    name: d.name,
    description: d.description,
    wikiPageId: d.wikiPageId,
    defaultRange: d.defaultRange,
    widgets: d.widgets,
  };
}

export default function MarketingDashboardPage() {
  const t = useT();
  const { dateTime } = useFormatters();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { can } = useMarketingAccess();
  const action = useAction();

  const dashboardKey = [...queryKeys.marketing, "dashboards", id];
  const {
    data: dashboard,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: dashboardKey,
    queryFn: () => marketingApi.getDashboard(id),
  });
  const [draft, setDraft] = useState<MarketingDashboardDefinition | null>(null);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [preview, setPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const revisions = useQuery({
    queryKey: [...dashboardKey, "revisions"],
    queryFn: () => marketingApi.dashboardRevisions(id),
    enabled: showHistory,
  });

  const editing = draft !== null;
  const wantsEdit = searchParams.get("edit") === "1";
  const canOperate = can("marketing.operate");
  // A freshly created dashboard opens straight into the editor.
  useEffect(() => {
    if (!dashboard || !wantsEdit) return;
    if (canOperate) {
      setDraft(toDefinition(dashboard));
      setBaseVersion(dashboard.version);
    }
    router.replace(`/marketing/dashboards/${id}`);
  }, [dashboard, wantsEdit, canOperate, router, id]);

  const startEdit = () => {
    if (!dashboard) return;
    setDraft(toDefinition(dashboard));
    setBaseVersion(dashboard.version);
    setChangeNote("");
    setPreview(false);
  };

  const save = () =>
    action.run(async () => {
      if (!draft) return;
      await marketingApi.updateDashboard(id, {
        ...draft,
        changeNote,
        expectedVersion: baseVersion ?? undefined,
      });
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.marketing });
    });

  const exportJson = () =>
    action.run(async () => {
      const body = await marketingApi.exportDashboard(id);
      const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dashboard-${body.definition.name.replace(/[^\w-]+/g, "_")}-v${body.version}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

  const restore = (version: number) =>
    action.run(async () => {
      await marketingApi.restoreDashboard(id, version);
      setShowHistory(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.marketing });
    });

  const remove = () =>
    action.run(async () => {
      await marketingApi.deleteDashboard(id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.marketing });
      router.push("/marketing/dashboards");
    });

  if (isLoading) return <div className={`h-40 ${loadingPanelClass}`} />;
  if (error || !dashboard) {
    return (
      <ErrorBanner message={t("marketing.common.loadFailed")} onRetry={() => void refetch()} />
    );
  }

  if (editing && draft) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setPreview((v) => !v)}>
            {preview ? t("marketing.editor.backToEdit") : t("marketing.editor.preview")}
          </Button>
          <Button variant="ghost" onClick={() => setDraft(null)}>
            {t("marketing.common.cancel")}
          </Button>
        </div>
        {action.error ? <ErrorBanner message={action.error} className="mb-4" /> : null}
        {preview ? (
          <DashboardView dashboard={draft} />
        ) : (
          <DashboardEditor draft={draft} onChange={setDraft} />
        )}
        <div
          className={`sticky bottom-0 mt-4 flex flex-wrap items-end gap-3 px-3 py-3 ${panelClass}`}
        >
          <div className="min-w-[240px] flex-1">
            <Field
              label={t("marketing.editor.changeNote")}
              hint={t("marketing.editor.changeNoteHint")}
              required
            >
              <input
                className={inputClass}
                value={changeNote}
                maxLength={1000}
                onChange={(e) => setChangeNote(e.target.value)}
              />
            </Field>
          </div>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={action.pending || !changeNote.trim() || !draft.name.trim()}
          >
            {t("marketing.editor.save")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {action.error ? <ErrorBanner message={action.error} className="mb-4" /> : null}
      <DashboardView
        key={`${dashboard.id}-${dashboard.version}`}
        dashboard={dashboard}
        showName
        actions={
          <>
            <Button size="sm" onClick={() => setShowHistory(true)}>
              {t("marketing.dashboards.history")}
            </Button>
            <Button size="sm" onClick={() => void exportJson()}>
              {t("marketing.dashboards.exportJson")}
            </Button>
            {can("marketing.operate") ? (
              <Button size="sm" variant="primary" onClick={startEdit}>
                {t("marketing.common.edit")}
              </Button>
            ) : null}
            {can("marketing.manage") ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={() => setConfirmDelete(true)}
              >
                {t("marketing.common.delete")}
              </Button>
            ) : null}
          </>
        }
      />

      <Modal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title={t("marketing.dashboards.history")}
        wide
      >
        {revisions.isLoading ? (
          <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
        ) : (
          <ol className="divide-y divide-gray-100">
            {(revisions.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {t("marketing.dashboards.release", { version: r.version })} — {r.changeNote}
                  </p>
                  <p className="text-xs text-gray-500">
                    {dateTime(r.createdAt)} · {r.authorName ?? "—"} ·{" "}
                    {t("marketing.dashboards.widgetCount", { count: r.definition.widgets.length })}
                  </p>
                </div>
                {can("marketing.operate") && r.version !== dashboard.version ? (
                  <Button
                    size="sm"
                    onClick={() => void restore(r.version)}
                    disabled={action.pending}
                  >
                    {t("marketing.dashboards.restore")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title={t("marketing.dashboards.deleteTitle")}
        description={t("marketing.dashboards.deleteDescription")}
        onConfirm={() => {
          setConfirmDelete(false);
          void remove();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
