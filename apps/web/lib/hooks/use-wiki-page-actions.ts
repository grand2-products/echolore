"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { queryKeys, wikiApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";

interface UseWikiPageActionsOptions {
  /** If the currently-viewed page is deleted, redirect to /wiki. */
  currentPageId?: string;
}

export function useWikiPageActions({ currentPageId }: UseWikiPageActionsOptions = {}) {
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

  return {
    actionError,
    clearActionError,
    handleReparent,
    handleAddSubPage,
    handleRenamePage,
    handleDeletePage,
    isCreating,
  };
}
