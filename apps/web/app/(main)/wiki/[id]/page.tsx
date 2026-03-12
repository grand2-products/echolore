"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { WikiEditor, WikiSidebar, type PageNode } from "@/components/wiki";
import { wikiApi, type Block, type Page } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useT } from "@/lib/i18n";
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
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const { dateTime } = useFormatters();

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
        setError(getApiErrorMessage(loadError, t("wiki.detail.loadError")));
      } finally {
        setIsLoading(false);
      }
    };

    if (pageId) {
      void fetchData();
    }
  }, [pageId]);

  const treePages = useMemo(() => buildPageTree(pages), [pages]);

  const resetDraft = () => {
    if (!currentPage) return;
    setPageTitle(currentPage.title);
    setContent(blocksToHtml(currentPage.title, blocks));
    setSaveError(null);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!currentPage) return;

    try {
      setIsSaving(true);
      setSaveError(null);
      await wikiApi.updatePage(currentPage.id, { title: pageTitle });
      await syncPageBlocks(currentPage.id, blocks, content);
      const pageRes = await wikiApi.getPage(currentPage.id);
      setBlocks(pageRes.blocks);
      setPageTitle(pageRes.page.title);
      setContent(blocksToHtml(pageRes.page.title, pageRes.blocks));
      setCurrentPage(pageRes.page);
      setIsEditing(false);
    } catch (saveErr) {
      setSaveError(getApiErrorMessage(saveErr, t("wiki.detail.saveError")));
    } finally {
      setIsSaving(false);
    }
  };

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
          <Link href="/wiki" className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            {t("wiki.detail.backToWiki")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <WikiSidebar pages={treePages} activeId={pageId} />

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
                {t("wiki.detail.updatedAt", { value: dateTime(currentPage.updatedAt) })}
              </p>
            </div>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={resetDraft}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                  >
                    {t("wiki.detail.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {isSaving ? t("wiki.detail.saving") : t("wiki.detail.save")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  {t("wiki.detail.edit")}
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
