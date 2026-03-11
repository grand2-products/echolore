"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { WikiEditor } from "@/components/wiki";
import { PageTree, type PageNode } from "@/components/wiki";
import { wikiApi, type Block, type Page } from "@/lib/api";

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

function blocksToHtml(pageTitle: string, pageBlocks: Block[]): string {
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const body = pageBlocks
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((block) => {
      const text = escapeHtml(block.content ?? "");
      switch (block.type) {
        case "heading1":
          return `<h1>${text}</h1>`;
        case "heading2":
          return `<h2>${text}</h2>`;
        case "heading3":
          return `<h3>${text}</h3>`;
        case "bulletList":
          return `<ul><li>${text}</li></ul>`;
        case "orderedList":
          return `<ol><li>${text}</li></ol>`;
        case "codeBlock":
          return `<pre><code>${text}</code></pre>`;
        case "image": {
          const src =
            typeof block.properties?.src === "string" ? escapeHtml(block.properties.src) : "";
          return src ? `<img src="${src}" alt="${text}" />` : "";
        }
        default:
          return `<p>${text}</p>`;
      }
    })
    .join("");

  return body || `<h1>${pageTitle}</h1><p>このページの内容を編集してください。</p>`;
}

export default function WikiDetailPage() {
  const params = useParams();
  const pageId = params.id as string;

  const [isEditing, setIsEditing] = useState(false);
  const [pageTitle, setPageTitle] = useState("");
  const [content, setContent] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [listRes, pageRes] = await Promise.all([
          wikiApi.listPages(),
          wikiApi.getPage(pageId),
        ]);

        setPages(listRes.pages);
        setCurrentPage(pageRes.page);
        setPageTitle(pageRes.page.title);
        setContent(blocksToHtml(pageRes.page.title, pageRes.blocks));
      } catch (e) {
        const message = e instanceof Error ? e.message : "ページの取得に失敗しました";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    if (pageId) {
      void fetchData();
    }
  }, [pageId]);

  const treePages = useMemo(() => buildPageTree(pages), [pages]);

  const handleSave = async () => {
    if (!currentPage) return;

    try {
      await wikiApi.updatePage(currentPage.id, { title: pageTitle });
      setCurrentPage({ ...currentPage, title: pageTitle });
      setIsEditing(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "保存に失敗しました";
      alert(message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-600">ページを読み込み中...</p>
      </div>
    );
  }

  if (error || !currentPage) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-gray-900">ページが見つかりません</h1>
          <p className="mb-4 text-gray-600">{error ?? "指定されたページは存在しません。"}</p>
          <Link
            href="/wiki"
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Wikiトップに戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
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
        <PageTree pages={treePages} activeId={pageId} />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              {isEditing ? (
                <input
                  type="text"
                  value={pageTitle}
                  onChange={(e) => setPageTitle(e.target.value)}
                  className="border-b border-gray-300 text-3xl font-bold text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              ) : (
                <h1 className="text-3xl font-bold text-gray-900">{pageTitle}</h1>
              )}
              <p className="mt-1 text-sm text-gray-500">
                最終更新: {new Date(currentPage.updatedAt).toLocaleString("ja-JP")}
              </p>
            </div>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                  >
                    保存
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  編集
                </button>
              )}
            </div>
          </div>

          <WikiEditor content={content} onChange={setContent} editable={isEditing} pageId={pageId} />
        </div>
      </div>
    </div>
  );
}
