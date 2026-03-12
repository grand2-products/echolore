"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { WikiSidebar } from "@/components/wiki";
import { NotionEditor } from "@/components/wiki/NotionEditor";
import { wikiApi, type Block, type Page, type Space } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";
import { groupPagesBySpace } from "@/lib/wiki-tree";

export default function WikiDetailPage() {
  const params = useParams();
  const pageId = params.id as string;
  const t = useT();
  const { dateTime } = useFormatters();

  const [pageTitle, setPageTitle] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [listRes, pageRes, spacesRes] = await Promise.all([
          wikiApi.listPages(),
          wikiApi.getPage(pageId),
          wikiApi.listSpaces(),
        ]);

        setPages(listRes.pages);
        setSpaces(spacesRes.spaces);
        setCurrentPage(pageRes.page);
        setBlocks(pageRes.blocks);
        setPageTitle(pageRes.page.title);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("wiki.detail.loadError"));
      } finally {
        setIsLoading(false);
      }
    };

    if (pageId) {
      void fetchData();
    }
  }, [pageId, retryNonce, t]);

  const pagesBySpace = useMemo(() => groupPagesBySpace(pages, spaces), [pages, spaces]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-600">{t("wiki.detail.loading")}</p>
      </div>
    );
  }

  if (error || !currentPage) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-gray-900">{t("wiki.detail.notFoundTitle")}</h1>
          <p className="mb-4 text-gray-600">{error ?? t("wiki.detail.notFoundDescription")}</p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setRetryNonce((current) => current + 1);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              {t("common.actions.retry")}
            </button>
            <Link href="/wiki" className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              {t("wiki.detail.backToWiki")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <WikiSidebar
        spaces={spaces}
        pagesBySpace={pagesBySpace}
        activeId={pageId}
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl p-8">
          <div className="mb-4">
            <p className="text-sm text-gray-500">
              {t("wiki.detail.updatedAt", { value: dateTime(currentPage.updatedAt) })}
            </p>
          </div>

          <NotionEditor
            pageId={pageId}
            initialBlocks={blocks}
            pageTitle={pageTitle}
            onTitleChange={setPageTitle}
          />
        </div>
      </div>
    </div>
  );
}
