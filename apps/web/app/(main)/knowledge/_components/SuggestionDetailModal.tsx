"use client";

import type { KnowledgeSuggestionDto } from "@echolore/shared/contracts";
import { useEffect, useState } from "react";
import { knowledgeApi } from "@/lib/api";
import { useT } from "@/lib/i18n";

interface Props {
  suggestionId: string;
  onClose: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}

export function SuggestionDetailModal({ suggestionId, onClose, onApprove, onReject }: Props) {
  const t = useT();
  const [suggestion, setSuggestion] = useState<KnowledgeSuggestionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    knowledgeApi
      .getSuggestion(suggestionId)
      .then((res) => setSuggestion(res.suggestion))
      .catch(() => setSuggestion(null))
      .finally(() => setLoading(false));
  }, [suggestionId]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await onApprove(suggestionId);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) return;
    setActionLoading(true);
    try {
      await onReject(suggestionId, rejectionReason.trim());
    } finally {
      setActionLoading(false);
    }
  };

  const handleBackdropKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      role="dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={handleBackdropKeyDown}
    >
      <div
        role="document"
        className="mx-4 max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="p-8 text-center text-gray-500">{t("admin.knowledge.loading")}</div>
        ) : !suggestion ? (
          <div className="p-8 text-center text-red-500">{t("admin.knowledge.notFound")}</div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {suggestion.proposedTitle}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {suggestion.targetType === "new_page"
                      ? t("admin.knowledge.newPage")
                      : t("admin.knowledge.updatePage")}
                    {" · "}
                    {suggestion.sourceSummary ?? suggestion.sourceType}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <title>Close</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* AI Reasoning */}
            <div className="border-b border-gray-100 bg-blue-50 px-6 py-3">
              <p className="text-sm font-medium text-blue-800">
                {t("admin.knowledge.aiReasoning")}
              </p>
              <p className="mt-1 text-sm text-blue-700">{suggestion.aiReasoning}</p>
            </div>

            {/* Content preview */}
            <div className="px-6 py-4">
              <h3 className="mb-3 text-sm font-medium text-gray-700">
                {t("admin.knowledge.proposedContent")}
              </h3>
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
                {suggestion.proposedBlocks.map((block) => (
                  <div key={`${block.type}-${block.sortOrder}`}>
                    {block.type === "heading1" && (
                      <h1 className="text-xl font-bold text-gray-900">{block.content}</h1>
                    )}
                    {block.type === "heading2" && (
                      <h2 className="text-lg font-semibold text-gray-900">{block.content}</h2>
                    )}
                    {block.type === "heading3" && (
                      <h3 className="text-base font-semibold text-gray-900">{block.content}</h3>
                    )}
                    {block.type === "text" && (
                      <p className="text-sm text-gray-700">{block.content}</p>
                    )}
                    {block.type === "bulletList" && (
                      <li className="ml-4 list-disc text-sm text-gray-700">{block.content}</li>
                    )}
                    {(block.type === "code" || block.type === "codeBlock") && (
                      <pre className="rounded bg-gray-800 p-2 text-xs text-green-300">
                        {block.content}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            {suggestion.status === "pending" && (
              <div className="border-t border-gray-200 px-6 py-4">
                {showRejectForm ? (
                  <div className="space-y-3">
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder={t("admin.knowledge.rejectionReasonPlaceholder")}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleReject}
                        disabled={actionLoading || !rejectionReason.trim()}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {t("admin.knowledge.confirmReject")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRejectForm(false)}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        {t("admin.knowledge.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={actionLoading}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {t("admin.knowledge.approve")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRejectForm(true)}
                      disabled={actionLoading}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {t("admin.knowledge.reject")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Rejection reason display */}
            {suggestion.status === "rejected" && suggestion.rejectionReason && (
              <div className="border-t border-gray-200 bg-red-50 px-6 py-3">
                <p className="text-sm font-medium text-red-800">
                  {t("admin.knowledge.rejectedReason")}
                </p>
                <p className="mt-1 text-sm text-red-700">{suggestion.rejectionReason}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
