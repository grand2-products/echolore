import type { KnowledgeSuggestionDto } from "@echolore/shared/contracts";
import { fetchApi } from "./fetch";

export const knowledgeApi = {
  listSuggestions: (params?: {
    status?: string;
    sourceType?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.sourceType) searchParams.set("sourceType", params.sourceType);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const qs = searchParams.toString();
    return fetchApi<{ suggestions: KnowledgeSuggestionDto[]; total: number }>(
      `/knowledge-suggestions${qs ? `?${qs}` : ""}`
    );
  },

  getSuggestion: (id: string) =>
    fetchApi<{ suggestion: KnowledgeSuggestionDto }>(`/knowledge-suggestions/${id}`),

  approveSuggestion: (id: string) =>
    fetchApi<{ success: boolean; pageId: string }>(`/knowledge-suggestions/${id}/approve`, {
      method: "POST",
    }),

  rejectSuggestion: (id: string, reason: string) =>
    fetchApi<{ success: boolean }>(`/knowledge-suggestions/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};
