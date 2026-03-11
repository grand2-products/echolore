"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WikiEditor } from "@/components/wiki";
import { PageTree, type PageNode } from "@/components/wiki";
import { wikiApi, type Page } from "@/lib/api";
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
      setError("Enter a title before saving.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const created = await wikiApi.createPage({ title });
      await syncPageBlocks(created.page.id, [], content);
      router.push(`/wiki/${created.page.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to create the page.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <PageTree pages={treePages} />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl p-8">
          <div className="mb-6">
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
              <Link href="/wiki" className="hover:text-blue-600">
                Wiki
              </Link>
              <span>/</span>
              <span>New Page</span>
            </div>

            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Page title"
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
              placeholder="Start drafting the page body..."
              editable={true}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href="/wiki"
              className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || !title.trim()}
              className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
