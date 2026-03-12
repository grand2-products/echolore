"use client";

import Link from "next/link";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { PageTree, type PageNode } from "./PageTree";
import type { Space } from "@/lib/api";

interface WikiSidebarProps {
  spaces?: Space[];
  pagesBySpace?: Record<string, PageNode[]>;
  pages?: PageNode[];
  activeId?: string;
  onReparent?: (pageId: string, parentId: string | null) => Promise<void> | void;
}

function spaceIcon(type: string): string {
  if (type === "general") return "[G]";
  if (type === "team") return "[T]";
  if (type === "personal") return "[P]";
  return "[?]";
}

function spaceLabel(type: string, name: string, t: (key: string) => string): string {
  if (type === "general") return t("wiki.spaces.general");
  if (type === "personal") return t("wiki.spaces.personal");
  return name;
}

function SpaceSection({
  space,
  pages,
  activeId,
  onReparent,
  t,
}: {
  space: Space;
  pages: PageNode[];
  activeId?: string;
  onReparent?: WikiSidebarProps["onReparent"];
  t: (key: string) => string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700"
        >
          <span className="inline-block w-4 text-center text-[10px]">{collapsed ? ">" : "v"}</span>
          <span className="text-[10px] text-gray-400">{spaceIcon(space.type)}</span>
          <span>{spaceLabel(space.type, space.name, t)}</span>
        </button>
        <Link
          href={`/wiki/new?spaceId=${space.id}`}
          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50"
        >
          {t("wiki.spaces.newPage")}
        </Link>
      </div>
      {!collapsed && (
        <div className="mt-1 ml-2">
          {pages.length > 0 ? (
            <PageTree pages={pages} activeId={activeId} onReparent={onReparent} />
          ) : (
            <p className="text-xs text-gray-400 py-1">{t("wiki.spaces.noPages")}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function WikiSidebar({ spaces, pagesBySpace, pages, activeId, onReparent }: WikiSidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const t = useT();

  // If spaces are provided, use space-grouped view; otherwise fallback to flat view
  const useSpaceView = spaces && spaces.length > 0 && pagesBySpace;

  const sidebarContent = useSpaceView ? (
    <div>
      {spaces.map((space) => (
        <SpaceSection
          key={space.id}
          space={space}
          pages={pagesBySpace[space.id] ?? []}
          activeId={activeId}
          onReparent={onReparent}
          t={t}
        />
      ))}
    </div>
  ) : (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500">{t("wiki.sidebar.pages")}</h2>
        <Link
          href="/wiki/new"
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          {t("wiki.sidebar.new")}
        </Link>
      </div>
      <PageTree pages={pages ?? []} activeId={activeId} onReparent={onReparent} />
    </div>
  );

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
            {sidebarContent}
          </div>
        ) : null}
      </div>

      <aside className="hidden w-64 border-r border-gray-200 bg-white p-4 md:block">
        {sidebarContent}
      </aside>
    </>
  );
}
