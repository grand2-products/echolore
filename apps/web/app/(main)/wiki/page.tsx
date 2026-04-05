"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ErrorBanner, LoadingState } from "@/components/ui";
import { ImportFileModal, SpacePickerModal } from "@/components/wiki";
import { useWikiPagesQuery } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import type { RecentWikiPage } from "@/lib/hooks/use-recent-wiki-pages";
import { useRecentWikiPages } from "@/lib/hooks/use-recent-wiki-pages";
import { useWikiPageActions } from "@/lib/hooks/use-wiki-page-actions";
import { useFormatters, useT } from "@/lib/i18n";

const EMPTY_RECENT: RecentWikiPage[] = [];

function formatRelativeDate(
  value: string | number,
  t: (key: string, vars?: Record<string, string>) => string
): string {
  const diff = Date.now() - (typeof value === "number" ? value : new Date(value).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("wiki.list.relativeTime.now");
  if (minutes < 60) return t("wiki.list.relativeTime.minutes", { count: String(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("wiki.list.relativeTime.hours", { count: String(hours) });
  const days = Math.floor(hours / 24);
  if (days < 30) return t("wiki.list.relativeTime.days", { count: String(days) });
  const months = Math.floor(days / 30);
  return t("wiki.list.relativeTime.months", { count: String(months) });
}

export default function WikiListPage() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const { number } = useFormatters();
  const { data, isLoading, error, refetch } = useWikiPagesQuery();
  const { handleAddSubPage } = useWikiPageActions();
  const { recentPages } = useRecentWikiPages();
  const [showSpacePicker, setShowSpacePicker] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [filter, setFilter] = useState("");

  const pages = data?.pages ?? [];

  // Cross-reference recent visits with API data:
  // - Drop entries whose page no longer exists (deleted)
  // - Use the latest title from the server, not the stale localStorage copy
  const resolvedRecentPages = useMemo(() => {
    if (!data) return EMPTY_RECENT; // API未ロード → 権限未確認のため非表示
    const pageMap = new Map(pages.map((p) => [p.id, p]));
    return recentPages
      .filter((entry) => pageMap.has(entry.id))
      .map((entry) => ({
        ...entry,
        title: pageMap.get(entry.id)?.title ?? entry.title,
      }));
  }, [recentPages, pages, data]);

  const filterLower = filter.trim().toLowerCase();
  const filteredPages = filterLower
    ? pages.filter((p) => (p.title || "").toLowerCase().includes(filterLower))
    : pages;

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-3xl font-bold text-gray-900">{t("wiki.list.title")}</h1>
        <p className="mb-8 text-gray-600">{t("wiki.list.description")}</p>

        <SpacePickerModal
          open={showSpacePicker}
          onClose={() => setShowSpacePicker(false)}
          onAddSubPage={handleAddSubPage}
        />
        <ImportFileModal open={showImport} onClose={() => setShowImport(false)} />

        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <button
            type="button"
            onClick={() => setShowSpacePicker(true)}
            className="block rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-500 hover:shadow-md"
          >
            <div className="mb-2 text-2xl">+</div>
            <h3 className="font-medium text-gray-900">{t("wiki.list.createTitle")}</h3>
            <p className="text-sm text-gray-500">{t("wiki.list.createDescription")}</p>
          </button>

          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="block rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-500 hover:shadow-md"
          >
            <div className="mb-2 text-2xl">^</div>
            <h3 className="font-medium text-gray-900">{t("wiki.import.cardTitle")}</h3>
            <p className="text-sm text-gray-500">{t("wiki.import.cardDescription")}</p>
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
            <p className="text-sm text-gray-500">
              {t("wiki.list.totalPages", { count: number(pages.length) })}
            </p>
          </div>
        </div>

        {resolvedRecentPages.length > 0 && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              {t("wiki.list.recentlyOpenedTitle")}
            </h2>
            <div className="space-y-1">
              {resolvedRecentPages.slice(0, 8).map((entry) => (
                <Link
                  key={entry.id}
                  href={`/wiki/${entry.id}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-gray-50"
                >
                  <svg
                    className="h-4 w-4 shrink-0 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                    {entry.title || t("wiki.newPage.defaultTitle")}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatRelativeDate(entry.visitedAt, t)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="shrink-0 text-lg font-semibold text-gray-900">
              {t("wiki.list.recentTitle")}
            </h2>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("wiki.list.filterPlaceholder")}
              className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <ErrorBanner
              message={getApiErrorMessage(error, t("wiki.list.loadError"))}
              onRetry={() => void refetch()}
            />
          ) : (
            <div className="space-y-1">
              {(filterLower ? filteredPages : filteredPages.slice(0, 10)).map((page) => (
                <Link
                  key={page.id}
                  href={`/wiki/${page.id}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-gray-50"
                >
                  <svg
                    className="h-4 w-4 shrink-0 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                    {page.title || t("wiki.newPage.defaultTitle")}
                  </span>
                  <span className="hidden shrink-0 items-center gap-2 text-xs text-gray-400 sm:flex">
                    {page.spaceName && <span>{page.spaceName}</span>}
                    {page.authorName && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span>{page.authorName}</span>
                      </>
                    )}
                    <span className="text-gray-300">·</span>
                    <span>{formatRelativeDate(page.updatedAt, t)}</span>
                  </span>
                </Link>
              ))}
              {filteredPages.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {filterLower ? t("wiki.list.noFilterResults") : t("wiki.list.noPages")}
                </p>
              ) : !filterLower && pages.length > 10 ? (
                <p className="mt-2 text-center text-xs text-gray-400">
                  {t("wiki.list.morePages", { count: number(pages.length - 10) })}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
