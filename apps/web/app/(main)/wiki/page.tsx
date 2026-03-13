"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { WikiSidebar, SpacePickerModal } from "@/components/wiki";
import { useWikiPagesQuery, useSpacesQuery, wikiApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useT } from "@/lib/i18n";
import { groupPagesBySpace } from "@/lib/wiki-tree";

export default function WikiListPage() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const { number } = useFormatters();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useWikiPagesQuery();
  const { data: spacesData } = useSpacesQuery();
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSpacePicker, setShowSpacePicker] = useState(false);

  const pages = data?.pages ?? [];
  const spaces = spacesData?.spaces ?? [];
  const pagesBySpace = useMemo(() => groupPagesBySpace(pages, spaces), [pages, spaces]);

  const handleReparent = async (pageId: string, parentId: string | null) => {
    setNotice(null);
    setActionError(null);
    try {
      await wikiApi.updatePage(pageId, { parentId });
      await queryClient.invalidateQueries({ queryKey: ["wiki", "pages"] });
      setNotice(t("wiki.list.reparentSuccess"));
    } catch (reparentError) {
      setActionError(getApiErrorMessage(reparentError, t("wiki.list.reparentError")));
    }
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      <WikiSidebar
        spaces={spaces}
        pagesBySpace={pagesBySpace}
        activeId={undefined}
        onReparent={handleReparent}
      />

      <div className="flex-1 p-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-4 text-3xl font-bold text-gray-900">{t("wiki.list.title")}</h1>
          <p className="mb-8 text-gray-600">
            {t("wiki.list.description")}
          </p>
          {notice ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}
          {actionError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {actionError}
            </div>
          ) : null}

          <SpacePickerModal open={showSpacePicker} onClose={() => setShowSpacePicker(false)} />

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <button
              type="button"
              onClick={() => setShowSpacePicker(true)}
              className="block rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-500 hover:shadow-md"
            >
              <div className="mb-2 text-2xl">+</div>
              <h3 className="font-medium text-gray-900">{t("wiki.list.createTitle")}</h3>
              <p className="text-sm text-gray-500">{t("wiki.list.createDescription")}</p>
            </button>

            <Link
              href="/search"
              className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-500 hover:shadow-md"
            >
              <div className="mb-2 text-2xl">?</div>
              <h3 className="font-medium text-gray-900">{t("wiki.list.searchTitle")}</h3>
              <p className="text-sm text-gray-500">{t("wiki.list.searchDescription")}</p>
            </Link>

            <div className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 text-2xl">#</div>
              <h3 className="font-medium text-gray-900">{t("wiki.list.totalTitle")}</h3>
              <p className="text-sm text-gray-500">{t("wiki.list.totalPages", { count: number(pages.length) })}</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("wiki.list.recentTitle")}</h2>
            {isLoading ? (
              <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
            ) : error ? (
              <div className="space-y-3">
                <p className="text-sm text-red-600">
                  {getApiErrorMessage(error, t("wiki.list.loadError"))}
                </p>
                <button
                  type="button"
                  onClick={() => void queryClient.invalidateQueries({ queryKey: ["wiki", "pages"] })}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  {t("common.actions.retry")}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {pages.slice(0, 5).map((page) => (
                  <Link
                    key={page.id}
                    href={`/wiki/${page.id}`}
                    className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-gray-50"
                  >
                    <span className="text-gray-400">-</span>
                    <span className="text-gray-700">{page.title}</span>
                  </Link>
                ))}
                {pages.length === 0 ? (
                  <p className="text-sm text-gray-500">{t("wiki.list.noPages")}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
