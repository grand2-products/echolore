"use client";

import { type Space, wikiApi } from "@/lib/api";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { type PageNode, PageTree } from "./PageTree";
import { SpacePickerModal } from "./SpacePickerModal";

interface WikiSidebarProps {
  spaces?: Space[];
  pagesBySpace?: Record<string, PageNode[]>;
  pages?: PageNode[];
  activeId?: string;
  onReparent?: (pageId: string, parentId: string | null) => Promise<void> | void;
  onAddSubPage?: (parentId: string, spaceId?: string) => void;
  onRenamePage?: (pageId: string, newTitle: string) => Promise<void> | void;
  onDeletePage?: (pageId: string) => Promise<void> | void;
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
  onAddSubPage,
  onRenamePage,
  onDeletePage,
  t,
}: {
  space: Space;
  pages: PageNode[];
  activeId?: string;
  onReparent?: WikiSidebarProps["onReparent"];
  onAddSubPage?: WikiSidebarProps["onAddSubPage"];
  onRenamePage?: WikiSidebarProps["onRenamePage"];
  onDeletePage?: WikiSidebarProps["onDeletePage"];
  t: (key: string) => string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const creatingRef = useRef(false);

  const handleNewPage = useCallback(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    wikiApi
      .createPage({ title: t("wiki.newPage.defaultTitle"), spaceId: space.id })
      .then((res) => {
        router.push(`/wiki/${res.page.id}`);
      })
      .catch(() => {
        creatingRef.current = false;
      });
  }, [router, space.id, t]);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700"
        >
          <span>{spaceLabel(space.type, space.name, t)}</span>
        </button>
        <button
          type="button"
          onClick={handleNewPage}
          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50"
        >
          {t("wiki.spaces.newPage")}
        </button>
      </div>
      {!collapsed && (
        <div className="mt-1 ml-2">
          {pages.length > 0 ? (
            <PageTree
              pages={pages}
              activeId={activeId}
              onReparent={onReparent}
              onAddSubPage={onAddSubPage}
              onRenamePage={onRenamePage}
              onDeletePage={onDeletePage}
            />
          ) : (
            <p className="text-xs text-gray-400 py-1">{t("wiki.spaces.noPages")}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function WikiSidebar({
  spaces,
  pagesBySpace,
  pages,
  activeId,
  onReparent,
  onAddSubPage,
  onRenamePage,
  onDeletePage,
}: WikiSidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showSpacePicker, setShowSpacePicker] = useState(false);
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
          onAddSubPage={onAddSubPage}
          onRenamePage={onRenamePage}
          onDeletePage={onDeletePage}
          t={t}
        />
      ))}
    </div>
  ) : (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500">{t("wiki.sidebar.pages")}</h2>
        <button
          type="button"
          onClick={() => setShowSpacePicker(true)}
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          {t("wiki.sidebar.new")}
        </button>
      </div>
      <SpacePickerModal open={showSpacePicker} onClose={() => setShowSpacePicker(false)} />
      <PageTree
        pages={pages ?? []}
        activeId={activeId}
        onReparent={onReparent}
        onAddSubPage={onAddSubPage}
        onRenamePage={onRenamePage}
        onDeletePage={onDeletePage}
      />
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
          <div className="mt-4">
            {sidebarContent}
            <div className="mt-4 border-t border-gray-200 pt-3">
              <Link href="/wiki/trash" className="text-xs text-gray-500 hover:text-gray-700">
                {t("wiki.sidebar.trash")}
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="hidden w-64 border-r border-gray-200 bg-white p-4 md:block">
        {sidebarContent}
        <div className="mt-4 border-t border-gray-200 pt-3">
          <Link href="/wiki/trash" className="text-xs text-gray-500 hover:text-gray-700">
            {t("wiki.sidebar.trash")}
          </Link>
        </div>
      </aside>
    </>
  );
}
