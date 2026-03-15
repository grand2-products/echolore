import type {
  GetFileDownloadUrlResponse,
  GetFileResponse,
  ListFilesResponse,
  SuccessResponse,
  UploadFileResponse,
} from "@corp-internal/shared/contracts";
import { executeApiRequest, fetchApi, parseApiError } from "./fetch";

export const filesApi = {
  list: () => fetchApi<ListFilesResponse>("/files"),

  get: (id: string) => fetchApi<GetFileResponse>(`/files/${id}`),

  getDownloadUrl: (id: string) => fetchApi<GetFileDownloadUrlResponse>(`/files/${id}/download`),

  upload: async (file: File): Promise<UploadFileResponse> => {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const response = await executeApiRequest("/files/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    return response.json();
  },

  delete: (id: string) =>
    fetchApi<SuccessResponse>(`/files/${id}`, {
      method: "DELETE",
    }),
};
