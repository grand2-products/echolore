"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { DropPosition } from "@/components/wiki/PageTree";
import type { Page } from "@/lib/api";
import { queryKeys, wikiApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";

interface UseWikiPageActionsOptions {
  /** If the currently-viewed page is deleted, redirect to /wiki. */
  currentPageId?: string;
  /** All visible pages (flat list, used for reorder sibling computation). */
  allPages?: Page[];
}

export function useWikiPageActions({ currentPageId, allPages }: UseWikiPageActionsOptions = {}) {
  const t = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const getApiErrorMessage = useApiErrorMessage();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const creatingRef = useRef(false);

  const clearActionError = useCallback(() => setActionError(null), []);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.wikiPages }),
    [queryClient]
  );

  const handleReparent = useCallback(
    async (pageId: string, parentId: string | null) => {
      setActionError(null);
      try {
        await wikiApi.updatePage(pageId, { parentId });
        await invalidate();
      } catch (err) {
        setActionError(getApiErrorMessage(err, t("wiki.list.reparentError")));
      }
    },
    [invalidate, t, getApiErrorMessage]
  );

  const handleAddSubPage = useCallback(
    (parentId?: string, spaceId?: string) => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      setIsCreating(true);
      wikiApi
        .createPage({ title: t("wiki.newPage.defaultTitle"), parentId, spaceId })
        .then(async (res) => {
          await invalidate();
          router.push(`/wiki/${res.page.id}?new=1`);
        })
        .catch((err) => {
          setActionError(getApiErrorMessage(err, t("wiki.newPage.createError")));
        })
        .finally(() => {
          creatingRef.current = false;
          setIsCreating(false);
        });
    },
    [invalidate, router, t, getApiErrorMessage]
  );

  const handleRenamePage = useCallback(
    async (pageId: string, newTitle: string) => {
      try {
        await wikiApi.updatePage(pageId, { title: newTitle });
        await invalidate();
      } catch (err) {
        setActionError(getApiErrorMessage(err, t("wiki.detail.saveError")));
      }
    },
    [invalidate, t, getApiErrorMessage]
  );

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      try {
        await wikiApi.deletePage(pageId);
        await invalidate();
        if (currentPageId && pageId === currentPageId) {
          router.push("/wiki");
        }
      } catch (err) {
        setActionError(getApiErrorMessage(err, t("wiki.tree.deleteError")));
      }
    },
    [invalidate, currentPageId, router, t, getApiErrorMessage]
  );

  const handleReorder = useCallback(
    async (pageId: string, targetId: string, position: DropPosition) => {
      if (!allPages) return;
      setActionError(null);

      // Find the target page to determine its parent and space
      const targetPage = allPages.find((p) => p.id === targetId);
      const draggedPage = allPages.find((p) => p.id === pageId);
      if (!targetPage || !draggedPage) return;

      const targetParentId = targetPage.parentId ?? null;
      const spaceId = targetPage.spaceId;

      // If the dragged page is moving to a different parent, reparent first
      const draggedParentId = draggedPage.parentId ?? null;
      if (draggedParentId !== targetParentId || draggedPage.spaceId !== spaceId) {
        try {
          await wikiApi.updatePage(pageId, { parentId: targetParentId });
        } catch (err) {
          setActionError(getApiErrorMessage(err, t("wiki.list.reparentError")));
          return;
        }
      }

      // Build the sibling list for target's parent, excluding the dragged page.
      // Use allPages as the source — even after a reparent API call above,
      // allPages still reflects the pre-reparent state. Since we filter out
      // the dragged page and then re-insert it at the desired position, the
      // resulting order is correct regardless.
      const siblings = allPages.filter(
        (p) =>
          (p.parentId ?? null) === targetParentId &&
          p.spaceId === spaceId &&
          p.id !== pageId &&
          !p.deletedAt
      );

      // Insert the dragged page at the correct position relative to target
      const targetIndex = siblings.findIndex((p) => p.id === targetId);
      if (targetIndex === -1) {
        await invalidate();
        return;
      }
      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      const newOrder = [
        ...siblings.slice(0, insertIndex).map((p) => p.id),
        pageId,
        ...siblings.slice(insertIndex).map((p) => p.id),
      ];

      try {
        await wikiApi.reorderPages({ pageIds: newOrder, parentId: targetParentId, spaceId });
        await invalidate();
      } catch (err) {
        await invalidate();
        setActionError(getApiErrorMessage(err, t("wiki.list.reparentError")));
      }
    },
    [allPages, invalidate, t, getApiErrorMessage]
  );

  return {
    actionError,
    clearActionError,
    handleReparent,
    handleAddSubPage,
    handleRenamePage,
    handleDeletePage,
    handleReorder,
    isCreating,
  };
}
