"use client";

import { ErrorBanner, LoadingState } from "@/components/ui";
import { ImportFileModal, SpacePickerModal } from "@/components/wiki";
import { useWikiPagesQuery } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useT } from "@/lib/i18n";
import Link from "next/link";
import { useState } from "react";

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

export default function WikiListPage() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const { number } = useFormatters();
  const { data, isLoading, error, refetch } = useWikiPagesQuery();
  const [showSpacePicker, setShowSpacePicker] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const pages = data?.pages ?? [];

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-3xl font-bold text-gray-900">{t("wiki.list.title")}</h1>
        <p className="mb-8 text-gray-600">{t("wiki.list.description")}</p>

        <SpacePickerModal open={showSpacePicker} onClose={() => setShowSpacePicker(false)} />
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

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("wiki.list.recentTitle")}</h2>
          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <ErrorBanner
              message={getApiErrorMessage(error, t("wiki.list.loadError"))}
              onRetry={() => void refetch()}
            />
          ) : (
            <div className="space-y-1">
              {pages.slice(0, 10).map((page) => (
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
                    <span>{formatRelativeDate(page.updatedAt)}</span>
                  </span>
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
  );
}
