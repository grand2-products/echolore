"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotionEditor } from "@/components/wiki/NotionEditor";
import { PagePermissionsPanel } from "@/components/wiki/PagePermissionsPanel";
import { VersionHistoryPanel } from "@/components/wiki/VersionHistoryPanel";
import { useAuthMeQuery, useWikiPageQuery, wikiApi } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

interface ActionMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function ActionMenu({ items }: { items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
        aria-label="Actions"
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WikiDetailPage() {
  const params = useParams();
  const pageId = params.id as string;
  const t = useT();
  const { dateTime } = useFormatters();

  const { data: authData } = useAuthMeQuery();
  const { data: pageData, isLoading, error, refetch } = useWikiPageQuery(pageId);

  const [showHistory, setShowHistory] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const snapshotStatusRef = useRef(snapshotStatus);
  snapshotStatusRef.current = snapshotStatus;

  const createSnapshot = useCallback(() => {
    if (snapshotStatusRef.current === "saving") return;
    setSnapshotStatus("saving");
    wikiApi
      .createRevision(pageId)
      .then(() => {
        setSnapshotStatus("saved");
        setTimeout(() => setSnapshotStatus("idle"), 2000);
      })
      .catch(() => {
        setSnapshotStatus("error");
        setTimeout(() => setSnapshotStatus("idle"), 3000);
      });
  }, [pageId]);

  // Ctrl+S / Cmd+S to create snapshot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        createSnapshot();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [createSnapshot]);

  const currentPage = pageData?.page ?? null;
  const blocks = pageData?.blocks ?? [];
  const [pageTitle, setPageTitle] = useState<string | null>(null);

  // Sync title from server data when page changes
  const [prevPageId, setPrevPageId] = useState(pageId);
  if (pageId !== prevPageId) {
    setPrevPageId(pageId);
    setPageTitle(null);
    setShowHistory(false);
    setShowPermissions(false);
    setSnapshotStatus("idle");
  }
  // Use user-edited title if set (even if empty), otherwise fall back to server data
  const resolvedTitle = pageTitle !== null ? pageTitle : (currentPage?.title ?? "");

  const userName = authData?.user?.name ?? "User";
  const userColor = useMemo(
    () => (authData?.user?.id ? stringToColor(authData.user.id) : "#3b82f6"),
    [authData?.user?.id]
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-600">{t("wiki.detail.loading")}</p>
      </div>
    );
  }

  if (error || !currentPage) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-gray-900">
            {t("wiki.detail.notFoundTitle")}
          </h1>
          <p className="mb-4 text-gray-600">
            {error instanceof Error ? error.message : t("wiki.detail.notFoundDescription")}
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              {t("common.actions.retry")}
            </button>
            <Link
              href="/wiki"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              {t("wiki.detail.backToWiki")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl p-8">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {t("wiki.detail.updatedAt", { value: dateTime(currentPage.updatedAt) })}
            </p>
            <ActionMenu
              items={[
                {
                  label:
                    snapshotStatus === "saving"
                      ? t("common.status.loading")
                      : snapshotStatus === "saved"
                        ? t("wiki.history.snapshotSaved")
                        : snapshotStatus === "error"
                          ? t("wiki.history.snapshotError")
                          : t("wiki.actions.snapshot"),
                  disabled: snapshotStatus === "saving",
                  onClick: createSnapshot,
                },
                {
                  label: t("wiki.actions.history"),
                  onClick: () => setShowHistory(true),
                },
                ...(authData?.user?.role === "admin" || authData?.user?.id === currentPage.authorId
                  ? [
                      {
                        label: t("wiki.actions.permissions"),
                        onClick: () => setShowPermissions(true),
                      },
                    ]
                  : []),
              ]}
            />
          </div>

          <NotionEditor
            pageId={pageId}
            initialBlocks={blocks}
            pageTitle={resolvedTitle}
            onTitleChange={setPageTitle}
            userName={userName}
            userColor={userColor}
          />
        </div>
      </div>

      {showPermissions && (
        <PagePermissionsPanel pageId={pageId} onClose={() => setShowPermissions(false)} />
      )}

      {showHistory && (
        <VersionHistoryPanel
          pageId={pageId}
          onClose={() => setShowHistory(false)}
          onRestored={() => {
            setShowHistory(false);
            void refetch();
          }}
        />
      )}
    </>
  );
}
