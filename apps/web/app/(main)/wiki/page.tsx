"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { WikiSidebar, type PageNode } from "@/components/wiki";
import { useWikiPagesQuery, wikiApi, type Page } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useT } from "@/lib/i18n";

function buildPageTree(flatPages: Page[]): PageNode[] {
  const nodeMap = new Map<string, PageNode>();

  for (const page of flatPages) {
    nodeMap.set(page.id, {
      id: page.id,
      title: page.title,
      parentId: page.parentId ?? undefined,
      children: [],
    });
  }

  const roots: PageNode[] = [];

  for (const page of flatPages) {
    const node = nodeMap.get(page.id);
    if (!node) continue;

    if (page.parentId) {
      const parent = nodeMap.get(page.parentId);
      if (parent) {
        parent.children = parent.children ?? [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export default function WikiListPage() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const { number } = useFormatters();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useWikiPagesQuery();

  const pages = data?.pages ?? [];
  const treePages = useMemo(() => buildPageTree(pages), [pages]);

  const handleReparent = async (pageId: string, parentId: string | null) => {
    await wikiApi.updatePage(pageId, { parentId });
    await queryClient.invalidateQueries({ queryKey: ["wiki", "pages"] });
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      <WikiSidebar pages={treePages} onReparent={handleReparent} />

      <div className="flex-1 p-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-4 text-3xl font-bold text-gray-900">{t("wiki.list.title")}</h1>
          <p className="mb-8 text-gray-600">
            {t("wiki.list.description")}
          </p>

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <Link
              href="/wiki/new"
              className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-500 hover:shadow-md"
            >
              <div className="mb-2 text-2xl">+</div>
              <h3 className="font-medium text-gray-900">{t("wiki.list.createTitle")}</h3>
              <p className="text-sm text-gray-500">{t("wiki.list.createDescription")}</p>
            </Link>

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
              <p className="text-sm text-red-600">
                {getApiErrorMessage(error, t("wiki.list.loadError"))}
              </p>
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
