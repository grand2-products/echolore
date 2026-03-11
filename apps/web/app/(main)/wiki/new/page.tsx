"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WikiEditor } from "@/components/wiki";
import { PageTree, type PageNode } from "@/components/wiki";
import { wikiApi, type Page } from "@/lib/api";

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

  useEffect(() => {
    const fetchPages = async () => {
      try {
        const pagesRes = await wikiApi.listPages();
        setPages(pagesRes.pages);
      } catch (e) {
        console.error("Failed to fetch pages", e);
      }
    };

    void fetchPages();
  }, []);

  const treePages = useMemo(() => buildPageTree(pages), [pages]);

  const handleSave = async () => {
    if (!title.trim()) {
      alert("繧ｿ繧､繝医Ν繧貞・蜉帙＠縺ｦ縺上□縺輔＞");
      return;
    }

    setIsSubmitting(true);

    try {
      const created = await wikiApi.createPage({
        title
      });

      router.push(`/wiki/${created.page.id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "繝壹・繧ｸ菴懈・縺ｫ螟ｱ謨励＠縺ｾ縺励◆";
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar with Page Tree */}
      <div className="w-64 border-r border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500">繝壹・繧ｸ荳隕ｧ</h2>
          <Link
            href="/wiki/new"
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            + 譁ｰ隕・          </Link>
        </div>
        <PageTree pages={treePages} />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl p-8">
          {/* Header */}
          <div className="mb-6">
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
              <Link href="/wiki" className="hover:text-blue-600">
                Wiki
              </Link>
              <span>/</span>
              <span>譁ｰ隕上・繝ｼ繧ｸ</span>
            </div>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="繝壹・繧ｸ繧ｿ繧､繝医Ν"
              className="w-full text-3xl font-bold text-gray-900 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none pb-2"
            />
          </div>

          {/* Editor */}
          <div className="mb-6">
            <WikiEditor
              content={content}
              onChange={setContent}
              placeholder="繝壹・繧ｸ縺ｮ蜀・ｮｹ繧貞・蜉帙＠縺ｦ縺上□縺輔＞..."
              editable={true}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Link
              href="/wiki"
              className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
            >
              繧ｭ繝｣繝ｳ繧ｻ繝ｫ
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

