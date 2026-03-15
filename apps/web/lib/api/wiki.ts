import type {
  CreateBlockRequest,
  CreateBlockResponse,
  CreatePageRequest,
  GetPageResponse,
  ListPagesResponse,
  SuccessResponse,
  UpdateBlockRequest,
  UpdatePageRequest,
} from "@echolore/shared/contracts";
import { executeApiRequest, fetchApi, parseApiError } from "./fetch";
import type {
  AdminGroup,
  AdminPagePermissionsResponse,
  AiChatConversation,
  AiChatMessage,
  Block,
  Page,
  PageRevision,
  Space,
  WikiSearchResponse,
} from "./types";

export const wikiApi = {
  listSpaces: () => fetchApi<{ spaces: Space[] }>("/wiki/spaces"),

  getOrCreatePersonalSpace: () =>
    fetchApi<{ space: Space }>("/wiki/spaces/personal", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  listPages: () => fetchApi<ListPagesResponse>("/wiki"),

  searchPages: (query: string, options?: { semantic?: boolean }) => {
    const semantic = options?.semantic ?? true;
    return fetchApi<WikiSearchResponse>(
      `/wiki/search?q=${encodeURIComponent(query)}&semantic=${semantic ? "1" : "0"}`
    );
  },

  getPage: (id: string) => fetchApi<GetPageResponse>(`/wiki/${id}`),

  createPage: (data: CreatePageRequest) =>
    fetchApi<{ page: Page }>("/wiki", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updatePage: (id: string, data: UpdatePageRequest) =>
    fetchApi<{ page: Page }>(`/wiki/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deletePage: (id: string) =>
    fetchApi<SuccessResponse>(`/wiki/${id}`, {
      method: "DELETE",
    }),

  createBlock: (data: CreateBlockRequest) =>
    fetchApi<CreateBlockResponse>("/wiki/blocks", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteBlock: (id: string) =>
    fetchApi<SuccessResponse>(`/wiki/blocks/${id}`, {
      method: "DELETE",
    }),

  updateBlock: (id: string, data: UpdateBlockRequest) =>
    fetchApi<CreateBlockResponse>(`/wiki/blocks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Revisions
  listRevisions: (pageId: string) =>
    fetchApi<{ revisions: PageRevision[] }>(`/wiki/${pageId}/revisions`),

  getRevision: (pageId: string, revisionId: string) =>
    fetchApi<{ revision: PageRevision }>(`/wiki/${pageId}/revisions/${revisionId}`),

  createRevision: (pageId: string) =>
    fetchApi<{ revision: PageRevision }>(`/wiki/${pageId}/revisions`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  restoreRevision: (pageId: string, revisionId: string) =>
    fetchApi<SuccessResponse>(`/wiki/${pageId}/revisions/${revisionId}/restore`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  // Trash
  listTrash: () => fetchApi<{ pages: Page[] }>("/wiki/trash"),

  restoreFromTrash: (pageId: string) =>
    fetchApi<{ page: Page }>(`/wiki/trash/${pageId}/restore`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  permanentDelete: (pageId: string) =>
    fetchApi<SuccessResponse>(`/wiki/trash/${pageId}`, {
      method: "DELETE",
    }),

  // Import
  importFile: async (
    file: File,
    spaceId: string,
    parentId?: string
  ): Promise<{ page: Page; blocks: Block[] }> => {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("spaceId", spaceId);
    if (parentId) formData.append("parentId", parentId);

    const response = await executeApiRequest("/wiki/import", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    return response.json();
  },

  // Permissions
  listGroups: () => fetchApi<{ groups: AdminGroup[] }>("/wiki/groups"),

  getPagePermissions: (pageId: string) =>
    fetchApi<AdminPagePermissionsResponse>(`/wiki/${pageId}/permissions`),

  setPagePermissions: (
    pageId: string,
    data: {
      inheritFromParent?: boolean;
      permissions: Array<{
        groupId: string;
        canRead: boolean;
        canWrite: boolean;
        canDelete: boolean;
      }>;
    }
  ) =>
    fetchApi<{ pageId: string; inheritFromParent: boolean }>(`/wiki/${pageId}/permissions`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

export const aiChatApi = {
  listConversations: (opts?: { mine?: boolean; query?: string }) => {
    const params = new URLSearchParams();
    if (opts?.mine) params.set("mine", "1");
    if (opts?.query) params.set("q", opts.query);
    const qs = params.toString();
    return fetchApi<{ conversations: AiChatConversation[] }>(`/ai-chat${qs ? `?${qs}` : ""}`);
  },

  createConversation: (data?: { title?: string; visibility?: "team" | "private" }) =>
    fetchApi<{ conversation: AiChatConversation }>("/ai-chat", {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    }),

  getConversation: (id: string) =>
    fetchApi<{ conversation: AiChatConversation; messages: AiChatMessage[] }>(`/ai-chat/${id}`),

  updateConversation: (id: string, data: { title?: string; visibility?: "team" | "private" }) =>
    fetchApi<{ conversation: AiChatConversation }>(`/ai-chat/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteConversation: (id: string) =>
    fetchApi<{ success: boolean }>(`/ai-chat/${id}`, {
      method: "DELETE",
    }),

  sendMessage: (conversationId: string, content: string) =>
    fetchApi<{ userMessage: AiChatMessage; assistantMessage: AiChatMessage }>(
      `/ai-chat/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      }
    ),
};
