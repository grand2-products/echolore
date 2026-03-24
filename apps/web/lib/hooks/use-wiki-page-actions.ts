"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { wikiApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";

interface UseWikiPageActionsOptions {
  /** Called after a mutation succeeds so the caller can refresh its data. */
  onMutate: () => void | Promise<void>;
  /** If the currently-viewed page is deleted, redirect to /wiki. */
  currentPageId?: string;
}

export function useWikiPageActions({ onMutate, currentPageId }: UseWikiPageActionsOptions) {
  const t = useT();
  const router = useRouter();
  const getApiErrorMessage = useApiErrorMessage();
  const [actionError, setActionError] = useState<string | null>(null);

  const clearActionError = useCallback(() => setActionError(null), []);

  const handleReparent = useCallback(
    async (pageId: string, parentId: string | null) => {
      setActionError(null);
      try {
        await wikiApi.updatePage(pageId, { parentId });
        await onMutate();
      } catch (err) {
        setActionError(getApiErrorMessage(err, t("wiki.list.reparentError")));
      }
    },
    [onMutate, t, getApiErrorMessage]
  );

  const handleAddSubPage = useCallback(
    (parentId?: string, spaceId?: string) => {
      wikiApi
        .createPage({ title: t("wiki.newPage.defaultTitle"), parentId, spaceId })
        .then(async (res) => {
          await onMutate();
          router.push(`/wiki/${res.page.id}?new=1`);
        })
        .catch((err) => {
          setActionError(getApiErrorMessage(err, t("wiki.newPage.createError")));
        });
    },
    [onMutate, router, t, getApiErrorMessage]
  );

  const handleRenamePage = useCallback(
    async (pageId: string, newTitle: string) => {
      try {
        await wikiApi.updatePage(pageId, { title: newTitle });
        await onMutate();
      } catch (err) {
        setActionError(getApiErrorMessage(err, t("wiki.detail.saveError")));
      }
    },
    [onMutate, t, getApiErrorMessage]
  );

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      try {
        await wikiApi.deletePage(pageId);
        if (currentPageId && pageId === currentPageId) {
          router.push("/wiki");
        } else {
          await onMutate();
        }
      } catch (err) {
        setActionError(getApiErrorMessage(err, t("wiki.tree.deleteError")));
      }
    },
    [onMutate, currentPageId, router, t, getApiErrorMessage]
  );

  return {
    actionError,
    clearActionError,
    handleReparent,
    handleAddSubPage,
    handleRenamePage,
    handleDeletePage,
  };
}
