"use client";

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { WikiSidebar } from "@/components/wiki";
import { useWikiPagesQuery, useSpacesQuery } from "@/lib/api";
import { useWikiPageActions } from "@/lib/use-wiki-page-actions";
import { groupPagesBySpace } from "@/lib/wiki-tree";

interface WikiLayoutProps {
  children: React.ReactNode;
}

export default function WikiLayout({ children }: WikiLayoutProps) {
  const params = useParams();
  const currentPageId = typeof params.id === "string" ? params.id : undefined;
  const queryClient = useQueryClient();

  const { data: pagesData } = useWikiPagesQuery();
  const { data: spacesData } = useSpacesQuery();

  const pages = pagesData?.pages ?? [];
  const spaces = spacesData?.spaces ?? [];
  const pagesBySpace = useMemo(() => groupPagesBySpace(pages, spaces), [pages, spaces]);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["wiki", "pages"] }),
    [queryClient],
  );

  const {
    handleReparent,
    handleAddSubPage,
    handleRenamePage,
    handleDeletePage,
  } = useWikiPageActions({ onMutate: invalidate, currentPageId });

  return (
    <div className="flex h-full flex-col md:flex-row">
      <WikiSidebar
        spaces={spaces}
        pagesBySpace={pagesBySpace}
        activeId={currentPageId}
        onReparent={handleReparent}
        onAddSubPage={handleAddSubPage}
        onRenamePage={handleRenamePage}
        onDeletePage={handleDeletePage}
      />
      {children}
    </div>
  );
}
