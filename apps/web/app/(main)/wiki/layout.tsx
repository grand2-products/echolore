"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { WikiSidebar } from "@/components/wiki";
import { useSpacesQuery, useWikiPagesQuery } from "@/lib/api";
import { useWikiPageActions } from "@/lib/hooks/use-wiki-page-actions";
import { useT } from "@/lib/i18n";
import { groupPagesBySpace } from "@/lib/wiki-tree";

interface WikiLayoutProps {
  children: React.ReactNode;
}

export default function WikiLayout({ children }: WikiLayoutProps) {
  const params = useParams();
  const t = useT();
  const currentPageId = typeof params.id === "string" ? params.id : undefined;
  const { data: pagesData } = useWikiPagesQuery();
  const { data: spacesData } = useSpacesQuery();

  const pages = pagesData?.pages ?? [];
  const spaces = spacesData?.spaces ?? [];
  const pagesBySpace = useMemo(() => groupPagesBySpace(pages, spaces), [pages, spaces]);

  const {
    handleReparent,
    handleAddSubPage,
    handleRenamePage,
    handleDeletePage,
    handleReorder,
    pendingSpaceMove,
    confirmSpaceMove,
    cancelSpaceMove,
    actionError,
    clearActionError,
    isCreating,
  } = useWikiPageActions({ currentPageId, allPages: pages, spaces });

  return (
    <div className="flex h-full flex-col md:flex-row">
      <WikiSidebar
        spaces={spaces}
        pagesBySpace={pagesBySpace}
        activeId={currentPageId}
        onReparent={handleReparent}
        onReorder={handleReorder}
        onAddSubPage={handleAddSubPage}
        onRenamePage={handleRenamePage}
        onDeletePage={handleDeletePage}
        isCreating={isCreating}
      />
      {children}
      {actionError && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow-lg">
            <span className="flex-1">{actionError}</span>
            <button
              type="button"
              onClick={clearActionError}
              className="rounded text-red-700 hover:text-red-900"
              aria-label={t("common.actions.close")}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingSpaceMove}
        title={t("wiki.moveSpace.title")}
        description={
          pendingSpaceMove
            ? t("wiki.moveSpace.description", { space: pendingSpaceMove.targetSpaceName })
            : undefined
        }
        confirmLabel={t("wiki.moveSpace.confirm")}
        variant="warning"
        onConfirm={() => void confirmSpaceMove()}
        onCancel={cancelSpaceMove}
      />
    </div>
  );
}
