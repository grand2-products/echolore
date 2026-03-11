"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { WikiEditor } from "@/components/wiki";
import { PageTree, type PageNode } from "@/components/wiki";
import { wikiApi, type Block, type Page } from "@/lib/api";
import { blocksToHtml, syncPageBlocks } from "@/lib/wiki-blocks";

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

export default function WikiDetailPage() {
  const params = useParams();
  const pageId = params.id as string;

  const [isEditing, setIsEditing] = useState(false);
  const [pageTitle, setPageTitle] = useState("");
  const [content, setContent] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [listRes, pageRes] = await Promise.all([wikiApi.listPages(), wikiApi.getPage(pageId)]);

        setPages(listRes.pages);
        setCurrentPage(pageRes.page);
        setBlocks(pageRes.blocks);
        setPageTitle(pageRes.page.title);
        setContent(blocksToHtml(pageRes.page.title, pageRes.blocks));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load the page.");
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
      setIsSaving(true);
      setSaveError(null);
      await wikiApi.updatePage(currentPage.id, { title: pageTitle });
      await syncPageBlocks(currentPage.id, blocks, content);
      const pageRes = await wikiApi.getPage(currentPage.id);
      setBlocks(pageRes.blocks);
      setContent(blocksToHtml(pageTitle, pageRes.blocks));
      setCurrentPage({ ...pageRes.page, title: pageTitle });
      setIsEditing(false);
    } catch (saveErr) {
      setSaveError(saveErr instanceof Error ? saveErr.message : "Failed to save the page.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-600">Loading page...</p>
      </div>
    );
  }

  if (error || !currentPage) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-gray-900">Page not found</h1>
          <p className="mb-4 text-gray-600">{error ?? "The requested page is unavailable."}</p>
          <Link href="/wiki" className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            Back to Wiki
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-64 border-r border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500">Pages</h2>
          <Link
            href="/wiki/new"
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            + New
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
                  onChange={(event) => setPageTitle(event.target.value)}
                  className="border-b border-gray-300 text-3xl font-bold text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              ) : (
                <h1 className="text-3xl font-bold text-gray-900">{pageTitle}</h1>
              )}
              <p className="mt-1 text-sm text-gray-500">
                Updated: {new Date(currentPage.updatedAt).toLocaleString("ja-JP")}
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
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {saveError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {saveError}
            </div>
          ) : null}

          <WikiEditor content={content} onChange={setContent} editable={isEditing} pageId={pageId} />
        </div>
      </div>
    </div>
  );
}
