"use client";

import { useCallback, useEffect, useState } from "react";
import { type PageRevision, wikiApi } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";

interface VersionHistoryPanelProps {
  pageId: string;
  onClose: () => void;
  onRestored: () => void;
}

export function VersionHistoryPanel({ pageId, onClose, onRestored }: VersionHistoryPanelProps) {
  const t = useT();
  const { dateTime } = useFormatters();
  const [revisions, setRevisions] = useState<PageRevision[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<PageRevision | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    wikiApi
      .listRevisions(pageId)
      .then((res) => setRevisions(res.revisions))
      .catch((err) => setError(err instanceof Error ? err.message : t("wiki.history.loadError")))
      .finally(() => setIsLoading(false));
  }, [pageId, t]);

  const handleRestore = useCallback(
    async (revisionId: string) => {
      if (restoring) return;
      if (!confirm(t("wiki.history.restoreConfirm"))) return;
      setRestoring(true);
      try {
        await wikiApi.restoreRevision(pageId, revisionId);
        onRestored();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("wiki.history.restoreError"));
      } finally {
        setRestoring(false);
      }
    },
    [pageId, restoring, onRestored, t]
  );

  return (
    <div className="fixed inset-y-0 right-0 z-[55] w-80 border-l border-gray-200 bg-white shadow-lg flex flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">{t("wiki.history.title")}</h2>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
          X
        </button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
        </div>
      ) : error ? (
        <div className="p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : revisions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500">{t("wiki.history.noRevisions")}</p>
        </div>
      ) : selectedRevision ? (
        <div className="flex-1 overflow-auto">
          <div className="p-4">
            <button
              type="button"
              onClick={() => setSelectedRevision(null)}
              className="mb-3 text-sm text-blue-600 hover:underline"
            >
              &lt; {t("wiki.history.backToList")}
            </button>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              #{selectedRevision.revisionNumber}: {selectedRevision.title}
            </h3>
            <p className="text-xs text-gray-500 mb-3">{dateTime(selectedRevision.createdAt)}</p>
            <div className="border border-gray-200 rounded-lg p-3 mb-3 max-h-96 overflow-auto">
              {selectedRevision.blocks.map((block, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no unique id
                <div key={i} className="mb-1 text-sm text-gray-700">
                  {block.type === "heading1" ? (
                    <h3 className="text-lg font-bold">{block.content}</h3>
                  ) : block.type === "heading2" ? (
                    <h4 className="text-base font-semibold">{block.content}</h4>
                  ) : block.type === "heading3" ? (
                    <h5 className="text-sm font-semibold">{block.content}</h5>
                  ) : block.type === "quote" ? (
                    <blockquote className="border-l-2 border-gray-300 pl-2 italic">
                      {block.content}
                    </blockquote>
                  ) : block.type === "bulletList" ? (
                    <p className="ml-3">- {block.content}</p>
                  ) : block.type === "orderedList" || block.type === "numberedList" ? (
                    <p className="ml-3">
                      {i + 1}. {block.content}
                    </p>
                  ) : block.type === "code" || block.type === "codeBlock" ? (
                    <pre className="bg-gray-100 rounded p-1 text-xs overflow-x-auto">
                      {block.content}
                    </pre>
                  ) : block.type === "divider" ? (
                    <hr className="my-2" />
                  ) : block.type === "image" ? (
                    <p className="text-xs text-gray-400">[image]</p>
                  ) : block.type === "file" ? (
                    <p className="text-xs text-gray-400">
                      [file:{" "}
                      {((block.properties as Record<string, unknown> | null)?.filename as string) ??
                        "attachment"}
                      ]
                    </p>
                  ) : (
                    <p>{block.content}</p>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={restoring}
              onClick={() => handleRestore(selectedRevision.id)}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {restoring ? t("common.status.loading") : t("wiki.history.restore")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="p-2">
            {revisions.map((rev) => (
              <button
                key={rev.id}
                type="button"
                onClick={() => setSelectedRevision(rev)}
                className="w-full text-left rounded-lg p-3 hover:bg-gray-50 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">#{rev.revisionNumber}</span>
                  <span className="text-xs text-gray-500">{dateTime(rev.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-600 truncate">{rev.title}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
