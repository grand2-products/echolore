"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WikiEditor, WikiSidebar, type PageNode } from "@/components/wiki";
import { wikiApi, type Page } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { syncPageBlocks } from "@/lib/wiki-blocks";

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

export default function NewWikiPage() {
  const router = useRouter();
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPages = async () => {
      try {
        const pagesRes = await wikiApi.listPages();
        setPages(pagesRes.pages);
      } catch (loadError) {
        console.error("Failed to fetch pages", loadError);
      }
    };

    void fetchPages();
  }, []);

  const treePages = useMemo(() => buildPageTree(pages), [pages]);

  const handleSave = async () => {
    if (!title.trim()) {
      setError(t("wiki.newPage.titleRequired"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const created = await wikiApi.createPage({ title });
      await syncPageBlocks(created.page.id, [], content);
      router.push(`/wiki/${created.page.id}`);
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("wiki.newPage.createError")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      <WikiSidebar pages={treePages} />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl p-8">
          <div className="mb-6">
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
              <Link href="/wiki" className="hover:text-blue-600">
                {t("wiki.list.title")}
              </Link>
              <span>/</span>
              <span>{t("wiki.newPage.breadcrumb")}</span>
            </div>

            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("wiki.newPage.titlePlaceholder")}
              className="w-full border-b-2 border-gray-200 pb-2 text-3xl font-bold text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mb-6">
            <WikiEditor
              content={content}
              onChange={setContent}
              placeholder={t("wiki.newPage.editorPlaceholder")}
              editable={true}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href="/wiki"
              className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
            >
              {t("wiki.newPage.cancel")}
            </Link>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || !title.trim()}
              className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? t("wiki.newPage.saving") : t("wiki.newPage.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
