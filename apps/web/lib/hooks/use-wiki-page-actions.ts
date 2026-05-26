"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { DropPosition } from "@/components/wiki/PageTree";
import type { Page, Space } from "@/lib/api";
import { queryKeys, wikiApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { setPageExpanded } from "@/lib/hooks/use-wiki-tree-expansion";
import { useT } from "@/lib/i18n";
import { resolveSpaceLabel } from "@/lib/wiki-tree";

interface UseWikiPageActionsOptions {
  /** If the currently-viewed page is deleted, redirect to /wiki. */
  currentPageId?: string;
  /** All visible pages (flat list, used for reorder sibling computation). */
  allPages?: Page[];
  /** Visible spaces (used to resolve the target space's display name in move confirmations). */
  spaces?: Space[];
}

export type PendingSpaceMove =
  | {
      kind: "reparent";
      pageId: string;
      parentId: string | null;
      targetSpaceId: string;
      targetSpaceName: string;
    }
  | {
      kind: "reorder";
      pageId: string;
      targetId: string;
      position: DropPosition;
      targetSpaceId: string;
      targetSpaceName: string;
    };

export function useWikiPageActions({
  currentPageId,
  allPages,
  spaces,
}: UseWikiPageActionsOptions = {}) {
  const t = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const getApiErrorMessage = useApiErrorMessage();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingSpaceMove, setPendingSpaceMove] = useState<PendingSpaceMove | null>(null);
  const creatingRef = useRef(false);

  const clearActionError = useCallback(() => setActionError(null), []);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.wikiPages }),
    [queryClient]
  );

  const resolveSpaceName = useCallback(
    (id: string) => {
      const space = spaces?.find((s) => s.id === id);
      return space ? resolveSpaceLabel(space, t) : id;
    },
    [spaces, t]
  );

  const performReparent = useCallback(
    async (pageId: string, parentId: string | null, targetSpaceId?: string) => {
      setActionError(null);
      try {
        const payload: { parentId: string | null; spaceId?: string } = { parentId };
        if (targetSpaceId) payload.spaceId = targetSpaceId;
        await wikiApi.updatePage(pageId, payload);
        await invalidate();
      } catch (err) {
        setActionError(getApiErrorMessage(err, t("wiki.list.reparentError")));
      }
    },
    [invalidate, t, getApiErrorMessage]
  );

  const performReorder = useCallback(
    async (pageId: string, targetId: string, position: DropPosition) => {
      if (!allPages) return;
      setActionError(null);

      const targetPage = allPages.find((p) => p.id === targetId);
      const draggedPage = allPages.find((p) => p.id === pageId);
      if (!targetPage || !draggedPage) return;

      const targetParentId = targetPage.parentId ?? null;
      const spaceId = targetPage.spaceId;

      const draggedParentId = draggedPage.parentId ?? null;
      const isSpaceChanging = draggedPage.spaceId !== spaceId;
      // Two reasons we may need an updatePage before reorder:
      //   - parent changed (same space, different nesting)
      //   - space changed (post-confirm, via `confirmSpaceMove`) — reorderPages
      //     requires all pages to already belong to the target space.
      if (draggedParentId !== targetParentId || isSpaceChanging) {
        try {
          const payload: { parentId: string | null; spaceId?: string } = {
            parentId: targetParentId,
          };
          if (isSpaceChanging && spaceId) payload.spaceId = spaceId;
          await wikiApi.updatePage(pageId, payload);
        } catch (err) {
          setActionError(getApiErrorMessage(err, t("wiki.list.reparentError")));
          return;
        }
      }

      const siblings = allPages.filter(
        (p) =>
          (p.parentId ?? null) === targetParentId &&
          p.spaceId === spaceId &&
          p.id !== pageId &&
          !p.deletedAt
      );

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

  const handleReparent = useCallback(
    async (pageId: string, parentId: string | null, targetSpaceId?: string) => {
      const draggedPage = allPages?.find((p) => p.id === pageId);
      if (targetSpaceId && draggedPage && draggedPage.spaceId !== targetSpaceId) {
        setPendingSpaceMove({
          kind: "reparent",
          pageId,
          parentId,
          targetSpaceId,
          targetSpaceName: resolveSpaceName(targetSpaceId),
        });
        return;
      }
      await performReparent(pageId, parentId, targetSpaceId);
    },
    [allPages, performReparent, resolveSpaceName]
  );

  const handleReorder = useCallback(
    async (pageId: string, targetId: string, position: DropPosition) => {
      if (!allPages) return;
      const targetPage = allPages.find((p) => p.id === targetId);
      const draggedPage = allPages.find((p) => p.id === pageId);
      if (!targetPage || !draggedPage) return;

      if (targetPage.spaceId && draggedPage.spaceId !== targetPage.spaceId) {
        setPendingSpaceMove({
          kind: "reorder",
          pageId,
          targetId,
          position,
          targetSpaceId: targetPage.spaceId,
          targetSpaceName: resolveSpaceName(targetPage.spaceId),
        });
        return;
      }
      await performReorder(pageId, targetId, position);
    },
    [allPages, performReorder, resolveSpaceName]
  );

  const confirmSpaceMove = useCallback(async () => {
    if (!pendingSpaceMove) return;
    const move = pendingSpaceMove;
    setPendingSpaceMove(null);
    if (move.kind === "reparent") {
      await performReparent(move.pageId, move.parentId, move.targetSpaceId);
    } else {
      await performReorder(move.pageId, move.targetId, move.position);
    }
  }, [pendingSpaceMove, performReparent, performReorder]);

  const cancelSpaceMove = useCallback(() => setPendingSpaceMove(null), []);

  const handleAddSubPage = useCallback(
    (parentId?: string, spaceId?: string) => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      setIsCreating(true);
      // Expand the parent so the newly created sub-page is visible in the tree
      // even if the parent was collapsed when the action was triggered.
      if (parentId) setPageExpanded(parentId, true);
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

  return {
    actionError,
    clearActionError,
    handleReparent,
    handleAddSubPage,
    handleRenamePage,
    handleDeletePage,
    handleReorder,
    pendingSpaceMove,
    confirmSpaceMove,
    cancelSpaceMove,
    isCreating,
  };
}
