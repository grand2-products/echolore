"use client";

import type { KnowledgeSuggestionDto } from "@echolore/shared/contracts";
import { useEffect, useState } from "react";
import { isApiErrorStatus, knowledgeApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useStableEvent } from "@/lib/hooks/use-stable-event";
import { useFormatters, useT } from "@/lib/i18n";
import { SuggestionDetailModal } from "./_components/SuggestionDetailModal";

const STATUS_OPTIONS = ["", "pending", "approved", "rejected"] as const;
const SOURCE_OPTIONS = ["", "file_upload", "transcription", "periodic_scan"] as const;

export default function KnowledgeSuggestionsPage() {
  const t = useT();
  const { date } = useFormatters();
  const getApiErrorMessage = useApiErrorMessage();
  const [suggestions, setSuggestions] = useState<KnowledgeSuggestionDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadSuggestions = useStableEvent(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await knowledgeApi.listSuggestions({
        status: statusFilter || undefined,
        sourceType: sourceFilter || undefined,
      });
      setSuggestions(response.suggestions);
      setTotal(response.total);
    } catch (loadError) {
      if (isApiErrorStatus(loadError, 403)) {
        setForbidden(true);
      } else {
        setError(getApiErrorMessage(loadError, t("admin.knowledge.loadError")));
      }
    } finally {
      setIsLoading(false);
    }
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-fetch when filters change
  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions, statusFilter, sourceFilter]);

  const handleApprove = async (id: string) => {
    setError(null);
    setNotice(null);
    try {
      await knowledgeApi.approveSuggestion(id);
      setNotice(t("admin.knowledge.approved"));
      setSelectedId(null);
      void loadSuggestions();
    } catch (err) {
      setError(getApiErrorMessage(err, t("admin.knowledge.approveError")));
    }
  };

  const handleReject = async (id: string, reason: string) => {
    setError(null);
    setNotice(null);
    try {
      await knowledgeApi.rejectSuggestion(id, reason);
      setNotice(t("admin.knowledge.rejected"));
      setSelectedId(null);
      void loadSuggestions();
    } catch (err) {
      setError(getApiErrorMessage(err, t("admin.knowledge.rejectError")));
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
    };
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-800"}`}
      >
        {status}
      </span>
    );
  };

  if (forbidden) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
          {t("admin.knowledge.forbidden")}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-4xl rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          {t("admin.knowledge.loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.knowledge.pageTitle")}</h1>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {notice && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{notice}</div>
        )}

        {/* Filters */}
        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">{t("admin.knowledge.allStatuses")}</option>
            {STATUS_OPTIONS.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">{t("admin.knowledge.allSources")}</option>
            {SOURCE_OPTIONS.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="ml-auto self-center text-sm text-gray-500">
            {t("admin.knowledge.totalCount", { count: total })}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("admin.knowledge.title")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("admin.knowledge.source")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("admin.knowledge.target")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("admin.knowledge.status")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("admin.knowledge.date")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {suggestions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    {t("admin.knowledge.noSuggestions")}
                  </td>
                </tr>
              ) : (
                suggestions.map((s) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setSelectedId(s.id)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {s.proposedTitle}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {s.sourceSummary ?? s.sourceType}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {s.targetType === "new_page"
                        ? t("admin.knowledge.newPage")
                        : t("admin.knowledge.updatePage")}
                    </td>
                    <td className="px-4 py-3">{statusBadge(s.status)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{date(s.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Detail modal */}
        {selectedId && (
          <SuggestionDetailModal
            suggestionId={selectedId}
            onClose={() => setSelectedId(null)}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}
      </div>
    </div>
  );
}
