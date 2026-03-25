import type {
  CreateUserRequest,
  GetUserResponse,
  ListAuthSessionsResponse,
  ListUsersResponse,
  SuccessResponse,
  UpdateUserRequest,
} from "@echolore/shared/contracts";
import { executeApiRequest, fetchApi, parseApiError } from "./fetch";

export const usersApi = {
  list: () => fetchApi<ListUsersResponse>("/users"),

  get: (id: string) => fetchApi<GetUserResponse>(`/users/${id}`),

  getByEmail: (email: string) =>
    fetchApi<GetUserResponse>(`/users/email/${encodeURIComponent(email)}`),

  listAuthSessions: () => fetchApi<ListAuthSessionsResponse>("/users/me/sessions"),

  revokeAuthSession: (id: string) =>
    fetchApi<SuccessResponse>(`/users/me/sessions/${id}`, {
      method: "DELETE",
    }),

  create: (data: CreateUserRequest) =>
    fetchApi<GetUserResponse>("/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateUserRequest) =>
    fetchApi<GetUserResponse>(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<SuccessResponse>(`/users/${id}`, {
      method: "DELETE",
    }),

  uploadAvatar: async (file: File): Promise<GetUserResponse> => {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const response = await executeApiRequest("/users/me/avatar", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    return response.json();
  },

  deleteAvatar: () =>
    fetchApi<GetUserResponse>("/users/me/avatar", {
      method: "DELETE",
    }),
};
