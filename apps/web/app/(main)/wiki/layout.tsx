"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { WikiSidebar } from "@/components/wiki";
import { useSpacesQuery, useWikiPagesQuery } from "@/lib/api";
import { useWikiPageActions } from "@/lib/hooks/use-wiki-page-actions";
import { groupPagesBySpace } from "@/lib/wiki-tree";

interface WikiLayoutProps {
  children: React.ReactNode;
}

export default function WikiLayout({ children }: WikiLayoutProps) {
  const params = useParams();
  const currentPageId = typeof params.id === "string" ? params.id : undefined;
  const { data: pagesData } = useWikiPagesQuery();
  const { data: spacesData } = useSpacesQuery();

  const pages = pagesData?.pages ?? [];
  const spaces = spacesData?.spaces ?? [];
  const pagesBySpace = useMemo(() => groupPagesBySpace(pages, spaces), [pages, spaces]);

  const { handleReparent, handleAddSubPage, handleRenamePage, handleDeletePage, isCreating } =
    useWikiPageActions({ currentPageId });

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
        isCreating={isCreating}
      />
      {children}
    </div>
  );
}
