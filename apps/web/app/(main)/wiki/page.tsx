"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { PageTree, type PageNode } from "@/components/wiki";
import { useWikiPagesQuery, wikiApi, type Page } from "@/lib/api";

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
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    error,
  } = useWikiPagesQuery();

  const pages = data?.pages ?? [];
  const treePages = useMemo(() => buildPageTree(pages), [pages]);

  const handleReparent = async (pageId: string, parentId: string | null) => {
    await wikiApi.updatePage(pageId, { parentId });
    await queryClient.invalidateQueries({ queryKey: ["wiki", "pages"] });
  };

  return (
    <div className="flex h-full">
      {/* Sidebar with Page Tree */}
      <div className="w-64 border-r border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500">ページ一覧</h2>
          <Link
            href="/wiki/new"
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            + 新規
          </Link>
        </div>
        <PageTree pages={treePages} onReparent={handleReparent} />
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-4 text-3xl font-bold text-gray-900">社内Wiki</h1>
          <p className="mb-8 text-gray-600">
            NotionライクなBlock-basedエディタでナレッジを共有します。
          </p>

          {/* Quick Actions */}
          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <Link
              href="/wiki/new"
              className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-500 hover:shadow-md"
            >
              <div className="mb-2 text-2xl">📝</div>
              <h3 className="font-medium text-gray-900">新規ページ作成</h3>
              <p className="text-sm text-gray-500">新しいWikiページを作成</p>
            </Link>

            <Link
              href="/search"
              className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-500 hover:shadow-md"
            >
              <div className="mb-2 text-2xl">🔍</div>
              <h3 className="font-medium text-gray-900">検索</h3>
              <p className="text-sm text-gray-500">ページを検索</p>
            </Link>

            <div className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 text-2xl">📊</div>
              <h3 className="font-medium text-gray-900">統計</h3>
              <p className="text-sm text-gray-500">{pages.length} ページ</p>
            </div>
          </div>

          {/* Recent Pages */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">最近更新されたページ</h2>
            {isLoading ? (
              <p className="text-sm text-gray-500">読み込み中...</p>
            ) : error ? (
              <p className="text-sm text-red-600">{error instanceof Error ? error.message : "ページの取得に失敗しました"}</p>
            ) : (
              <div className="space-y-2">
                {pages.slice(0, 5).map((page) => (
                  <Link
                    key={page.id}
                    href={`/wiki/${page.id}`}
                    className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-gray-50"
                  >
                    <span className="text-gray-400">📄</span>
                    <span className="text-gray-700">{page.title}</span>
                  </Link>
                ))}
                {pages.length === 0 && <p className="text-sm text-gray-500">ページがありません</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
