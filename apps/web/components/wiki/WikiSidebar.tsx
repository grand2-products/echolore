"use client";

import Link from "next/link";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { PageTree, type PageNode } from "./PageTree";

interface WikiSidebarProps {
  pages: PageNode[];
  activeId?: string;
  onReparent?: (pageId: string, parentId: string | null) => Promise<void> | void;
}

export function WikiSidebar({ pages, activeId, onReparent }: WikiSidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const t = useT();

  return (
    <>
      <div className="border-b border-gray-200 bg-white p-4 md:hidden">
        <button
          type="button"
          onClick={() => setIsMobileOpen((open) => !open)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {isMobileOpen ? t("wiki.sidebar.hideTree") : t("wiki.sidebar.showTree")}
        </button>
        {isMobileOpen ? (
          <div className="mt-4 rounded-lg border border-gray-200 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-500">{t("wiki.sidebar.pages")}</h2>
              <Link
                href="/wiki/new"
                className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
              >
                {t("wiki.sidebar.new")}
              </Link>
            </div>
            <PageTree pages={pages} activeId={activeId} onReparent={onReparent} />
          </div>
        ) : null}
      </div>

      <aside className="hidden w-64 border-r border-gray-200 bg-white p-4 md:block">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500">{t("wiki.sidebar.pages")}</h2>
          <Link
            href="/wiki/new"
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            {t("wiki.sidebar.new")}
          </Link>
        </div>
        <PageTree pages={pages} activeId={activeId} onReparent={onReparent} />
      </aside>
    </>
  );
}
