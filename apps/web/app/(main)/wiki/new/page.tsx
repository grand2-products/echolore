"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WikiEditor } from "@/components/wiki";
import { PageTree, type PageNode } from "@/components/wiki";
import { usersApi, wikiApi, type Page } from "@/lib/api";

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
  const [authorId, setAuthorId] = useState<string | null>(null);

  useEffect(() => {
    const fetchPages = async () => {
      try {
        const [pagesRes, usersRes] = await Promise.all([wikiApi.listPages(), usersApi.list()]);
        setPages(pagesRes.pages);
        setAuthorId(usersRes.users[0]?.id ?? null);
      } catch (e) {
        console.error("Failed to fetch pages", e);
      }
    };

    void fetchPages();
  }, []);

  const treePages = useMemo(() => buildPageTree(pages), [pages]);

  const handleSave = async () => {
    if (!title.trim()) {
      alert("タイトルを入力してください");
      return;
    }

    if (!authorId) {
      alert("作成者ユーザーが見つかりません。先にユーザーを作成してください。");
      return;
    }

    setIsSubmitting(true);

    try {
      const created = await wikiApi.createPage({
        title,
        authorId,
      });

      router.push(`/wiki/${created.page.id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "ページ作成に失敗しました";
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
          <h2 className="text-sm font-semibold text-gray-500">ページ一覧</h2>
          <Link
            href="/wiki/new"
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            + 新規
          </Link>
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
              <span>新規ページ</span>
            </div>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ページタイトル"
              className="w-full text-3xl font-bold text-gray-900 border-b-2 border-gray-200 focus:border-blue-500 focus:outline-none pb-2"
            />
          </div>

          {/* Editor */}
          <div className="mb-6">
            <WikiEditor
              content={content}
              onChange={setContent}
              placeholder="ページの内容を入力してください..."
              editable={true}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Link
              href="/wiki"
              className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </Link>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || !title.trim()}
              className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
