import type { SuccessResponse } from "@contracts/index";
import { executeApiRequest, fetchApi, parseApiError } from "./fetch";
import type {
  AdminGroup,
  AdminGroupDetail,
  AdminSpacePermissionsResponse,
  AdminUserRecord,
  AgentDefinition,
  AuthSettings,
  CreateAdminGroupRequest,
  CreateAgentRequest,
  EmailSettings,
  GcpCredentials,
  KpiOverviewResponse,
  LlmSettings,
  SiteSettings,
  StorageSettings,
  UpdateAdminGroupRequest,
  UpdateAgentRequest,
  UpdateAuthSettingsRequest,
  UpdateEmailSettingsRequest,
  UpdateGcpCredentialsRequest,
  UpdateLlmSettingsRequest,
  UpdateSiteSettingsRequest,
  UpdateStorageSettingsRequest,
} from "./types";

export const metricsApi = {
  getOverview: (windowDays = 30) =>
    fetchApi<KpiOverviewResponse>(`/admin/metrics/overview?windowDays=${windowDays}`),
};

export const adminApi = {
  listGroups: () => fetchApi<{ groups: AdminGroup[] }>("/admin/groups"),

  getGroup: (id: string) => fetchApi<{ group: AdminGroupDetail }>(`/admin/groups/${id}`),

  createGroup: (data: CreateAdminGroupRequest) =>
    fetchApi<{ group: AdminGroup }>("/admin/groups", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateGroup: (id: string, data: UpdateAdminGroupRequest) =>
    fetchApi<{ group: AdminGroup }>(`/admin/groups/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteGroup: (id: string) =>
    fetchApi<SuccessResponse>(`/admin/groups/${id}`, {
      method: "DELETE",
    }),

  listUsers: () => fetchApi<{ users: AdminUserRecord[] }>("/admin/users"),

  updateUserRole: (id: string, role: "admin" | "member") =>
    fetchApi<{ user: AdminUserRecord }>(`/admin/users/${id}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),

  updateUserGroups: (id: string, groupIds: string[]) =>
    fetchApi<{ success: boolean; groupIds: string[] }>(`/admin/users/${id}/groups`, {
      method: "PUT",
      body: JSON.stringify({ groupIds }),
    }),

  getSpacePermissions: (spaceId: string) =>
    fetchApi<AdminSpacePermissionsResponse>(`/admin/permissions/spaces/${spaceId}`),

  setSpacePermissions: (
    spaceId: string,
    data: {
      permissions: Array<{
        groupId: string;
        canRead: boolean;
        canWrite: boolean;
        canDelete: boolean;
      }>;
    }
  ) =>
    fetchApi<{ spaceId: string; updated: boolean }>(`/admin/permissions/spaces/${spaceId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteSpacePermission: (spaceId: string, groupId: string) =>
    fetchApi<SuccessResponse>(`/admin/permissions/spaces/${spaceId}/groups/${groupId}`, {
      method: "DELETE",
    }),

  listAgents: () => fetchApi<{ agents: AgentDefinition[] }>("/admin/agents"),

  createAgent: (data: CreateAgentRequest) =>
    fetchApi<{ agent: AgentDefinition }>("/admin/agents", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateAgent: (id: string, data: UpdateAgentRequest) =>
    fetchApi<{ agent: AgentDefinition }>(`/admin/agents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getSiteSettings: () => fetchApi<SiteSettings>("/admin/settings"),

  updateSiteSettings: (data: UpdateSiteSettingsRequest) =>
    fetchApi<Partial<SiteSettings>>("/admin/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getGcpCredentials: () => fetchApi<GcpCredentials>("/admin/gcp-credentials"),

  updateGcpCredentials: (data: UpdateGcpCredentialsRequest) =>
    fetchApi<GcpCredentials>("/admin/gcp-credentials", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getAuthSettings: () => fetchApi<AuthSettings>("/admin/auth-settings"),

  updateAuthSettings: (data: UpdateAuthSettingsRequest) =>
    fetchApi<AuthSettings>("/admin/auth-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getEmailSettings: () => fetchApi<EmailSettings>("/admin/email-settings"),

  updateEmailSettings: (data: UpdateEmailSettingsRequest) =>
    fetchApi<EmailSettings>("/admin/email-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getLlmSettings: () => fetchApi<LlmSettings>("/admin/llm-settings"),

  updateLlmSettings: (data: UpdateLlmSettingsRequest) =>
    fetchApi<LlmSettings>("/admin/llm-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  testLlmConnection: () =>
    fetchApi<{ ok: boolean; reply?: string; error?: string }>("/admin/llm-settings/test", {
      method: "POST",
    }),

  getStorageSettings: () => fetchApi<StorageSettings>("/admin/storage-settings"),

  updateStorageSettings: (data: UpdateStorageSettingsRequest) =>
    fetchApi<StorageSettings>("/admin/storage-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  testStorageConnection: () =>
    fetchApi<{ ok: boolean; provider?: string; error?: string }>("/admin/storage-settings/test", {
      method: "POST",
    }),

  uploadSiteIcon: async (file: File): Promise<{ success: boolean }> => {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const response = await executeApiRequest("/admin/site-icon", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    return response.json();
  },

  deleteSiteIcon: () =>
    fetchApi<{ success: boolean }>("/admin/site-icon", {
      method: "DELETE",
    }),
};
