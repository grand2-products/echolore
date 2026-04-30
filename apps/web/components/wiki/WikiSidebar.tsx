"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Space } from "@/lib/api";
import { wikiApi } from "@/lib/api/wiki";
import { useT } from "@/lib/i18n";
import { resolveSpaceLabel } from "@/lib/wiki-tree";
import { DRAG_MIME, type DropPosition, type PageNode, PageTree } from "./PageTree";
import { SpaceEmojiPicker } from "./SpaceEmojiPicker";
import { SpacePickerModal } from "./SpacePickerModal";

const SPACE_COLLAPSED_KEY = "echolore:wiki:space-collapsed";

function readSpaceCollapsedMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SPACE_COLLAPSED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeSpaceCollapsedMap(map: Record<string, boolean>) {
  try {
    localStorage.setItem(SPACE_COLLAPSED_KEY, JSON.stringify(map));
  } catch {}
}

const PERSONAL_GROUP_COLLAPSED_KEY = "echolore:wiki:personal-group-collapsed";

function usePersonalGroupCollapsed() {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(PERSONAL_GROUP_COLLAPSED_KEY) !== "false";
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    setValue((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PERSONAL_GROUP_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  return { value, toggle };
}

interface WikiSidebarProps {
  spaces?: Space[];
  pagesBySpace?: Record<string, PageNode[]>;
  pages?: PageNode[];
  activeId?: string;
  onReparent?: (
    pageId: string,
    parentId: string | null,
    targetSpaceId?: string
  ) => Promise<void> | void;
  onReorder?: (pageId: string, targetId: string, position: DropPosition) => Promise<void> | void;
  onAddSubPage?: (parentId?: string, spaceId?: string) => void;
  onRenamePage?: (pageId: string, newTitle: string) => Promise<void> | void;
  onDeletePage?: (pageId: string) => Promise<void> | void;
  isCreating?: boolean;
}

function SpaceSection({
  space,
  pages,
  activeId,
  onReparent,
  onReorder,
  onAddSubPage,
  onRenamePage,
  onDeletePage,
  isCreating,
  t,
}: {
  space: Space;
  pages: PageNode[];
  activeId?: string;
  onReparent?: WikiSidebarProps["onReparent"];
  onReorder?: WikiSidebarProps["onReorder"];
  onAddSubPage?: WikiSidebarProps["onAddSubPage"];
  onRenamePage?: WikiSidebarProps["onRenamePage"];
  onDeletePage?: WikiSidebarProps["onDeletePage"];
  isCreating?: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    const map = readSpaceCollapsedMap();
    return map[space.id] ?? true;
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    const map = readSpaceCollapsedMap();
    map[space.id] = collapsed;
    writeSpaceCollapsedMap(map);
  }, [collapsed, space.id]);

  const handleEmojiChange = useCallback(
    async (emoji: string | null) => {
      try {
        await wikiApi.updateSpace(space.id, { emoji });
        queryClient.invalidateQueries({ queryKey: ["wiki", "spaces"] });
      } catch {}
    },
    [space.id, queryClient]
  );

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs font-semibold text-gray-500">
          <SpaceEmojiPicker emoji={space.emoji} onSelect={handleEmojiChange} />
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hover:text-gray-700"
          >
            {resolveSpaceLabel(space, t)}
          </button>
        </div>
        <button
          type="button"
          disabled={isCreating}
          onClick={() => onAddSubPage?.(undefined, space.id)}
          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 disabled:pointer-events-none disabled:opacity-50"
        >
          {t("wiki.spaces.newPage")}
        </button>
      </div>
      {!collapsed && (
        <div className="mt-1">
          {pages.length > 0 ? (
            <PageTree
              pages={pages}
              activeId={activeId}
              spaceId={space.id}
              onReparent={onReparent}
              onReorder={onReorder}
              onAddSubPage={onAddSubPage}
              onRenamePage={onRenamePage}
              onDeletePage={onDeletePage}
              isCreating={isCreating}
            />
          ) : (
            <section
              aria-label={t("wiki.spaces.noPages")}
              className="text-xs text-gray-400 py-1"
              onDragOver={(event) => {
                if (onReparent) event.preventDefault();
              }}
              onDrop={(event) => {
                if (!onReparent) return;
                event.preventDefault();
                const draggedId = event.dataTransfer.getData(DRAG_MIME);
                if (draggedId) void onReparent(draggedId, null, space.id);
              }}
            >
              {t("wiki.spaces.noPages")}
            </section>
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
  onReorder,
  onAddSubPage,
  onRenamePage,
  onDeletePage,
  isCreating,
}: WikiSidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showSpacePicker, setShowSpacePicker] = useState(false);
  const t = useT();

  // If spaces are provided, use space-grouped view; otherwise fallback to flat view
  const useSpaceView = spaces && spaces.length > 0 && pagesBySpace;

  const personalGroupCollapsed = usePersonalGroupCollapsed();

  const sidebarContent = useSpaceView ? (
    <div>
      {spaces
        .filter((s) => s.type !== "personal")
        .map((space) => (
          <SpaceSection
            key={space.id}
            space={space}
            pages={pagesBySpace[space.id] ?? []}
            activeId={activeId}
            onReparent={onReparent}
            onReorder={onReorder}
            onAddSubPage={onAddSubPage}
            onRenamePage={onRenamePage}
            onDeletePage={onDeletePage}
            isCreating={isCreating}
            t={t}
          />
        ))}
      {spaces.some((s) => s.type === "personal") && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => personalGroupCollapsed.toggle()}
            className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700"
          >
            <svg
              className={`h-3 w-3 transition-transform ${personalGroupCollapsed.value ? "" : "rotate-90"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>{t("wiki.spaces.personalGroup")}</span>
          </button>
          {!personalGroupCollapsed.value && (
            <div className="mt-1 ml-2">
              {spaces
                .filter((s) => s.type === "personal")
                .map((space) => (
                  <SpaceSection
                    key={space.id}
                    space={space}
                    pages={pagesBySpace[space.id] ?? []}
                    activeId={activeId}
                    onReparent={onReparent}
                    onReorder={onReorder}
                    onAddSubPage={onAddSubPage}
                    onRenamePage={onRenamePage}
                    onDeletePage={onDeletePage}
                    isCreating={isCreating}
                    t={t}
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  ) : (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500">{t("wiki.sidebar.pages")}</h2>
        <button
          type="button"
          disabled={isCreating}
          onClick={() => setShowSpacePicker(true)}
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {t("wiki.sidebar.new")}
        </button>
      </div>
      {onAddSubPage && (
        <SpacePickerModal
          open={showSpacePicker}
          onClose={() => setShowSpacePicker(false)}
          onAddSubPage={onAddSubPage}
          loading={isCreating}
        />
      )}
      <PageTree
        pages={pages ?? []}
        activeId={activeId}
        onReparent={onReparent}
        onReorder={onReorder}
        onAddSubPage={onAddSubPage}
        onRenamePage={onRenamePage}
        onDeletePage={onDeletePage}
        isCreating={isCreating}
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

      <aside className="hidden h-full w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-4 md:block">
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
