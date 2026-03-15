"use client";

import { type Page, wikiApi } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function WikiTrashPage() {
  const t = useT();
  const { dateTime } = useFormatters();
  const [pages, setPages] = useState<Page[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadTrash = useCallback(() => {
    setIsLoading(true);
    setError(null);
    wikiApi
      .listTrash()
      .then((res) => setPages(res.pages))
      .catch((err) => setError(err instanceof Error ? err.message : t("wiki.trash.loadError")))
      .finally(() => setIsLoading(false));
  }, [t]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const handleRestore = useCallback(
    async (pageId: string) => {
      if (actionInProgress) return;
      setActionInProgress(pageId);
      try {
        await wikiApi.restoreFromTrash(pageId);
        loadTrash();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("wiki.trash.restoreError"));
      } finally {
        setActionInProgress(null);
      }
    },
    [actionInProgress, loadTrash, t]
  );

  const handlePermanentDelete = useCallback(
    async (pageId: string) => {
      if (actionInProgress) return;
      if (!confirm(t("wiki.trash.permanentDeleteConfirm"))) return;
      setActionInProgress(pageId);
      try {
        await wikiApi.permanentDelete(pageId);
        loadTrash();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("wiki.trash.deleteError"));
      } finally {
        setActionInProgress(null);
      }
    },
    [actionInProgress, loadTrash, t]
  );

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("wiki.trash.title")}</h1>
        <Link href="/wiki" className="text-sm text-blue-600 hover:underline">
          {t("wiki.detail.backToWiki")}
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
      ) : pages.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">{t("wiki.trash.empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
            >
              <div>
                <h3 className="font-medium text-gray-900">{page.title}</h3>
                <p className="text-xs text-gray-500">
                  {t("wiki.trash.deletedAt", { value: dateTime(page.deletedAt ?? page.updatedAt) })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={actionInProgress === page.id}
                  onClick={() => handleRestore(page.id)}
                  className="rounded border border-green-300 bg-green-50 px-3 py-1 text-xs text-green-700 hover:bg-green-100 disabled:opacity-50"
                >
                  {t("wiki.trash.restore")}
                </button>
                <button
                  type="button"
                  disabled={actionInProgress === page.id}
                  onClick={() => handlePermanentDelete(page.id)}
                  className="rounded border border-red-300 bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  {t("wiki.trash.permanentDelete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
