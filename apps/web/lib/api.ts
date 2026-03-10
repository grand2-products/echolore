/**
 * API Client for corp-internal
 * Handles all communication with the backend API
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

// ===========================================
// Types
// ===========================================

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface Page {
  id: string;
  title: string;
  parentId: string | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Block {
  id: string;
  pageId: string;
  type: string;
  content: string | null;
  properties: Record<string, unknown> | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Meeting {
  id: string;
  title: string;
  creatorId: string;
  roomName: string;
  status: "scheduled" | "active" | "ended";
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface Transcript {
  id: string;
  meetingId: string;
  speakerId: string | null;
  content: string;
  timestamp: string;
  createdAt: string;
}

export interface Summary {
  id: string;
  meetingId: string;
  content: string;
  createdAt: string;
}

export interface FileMetadata {
  id: string;
  filename: string;
  contentType: string | null;
  size: number | null;
  gcsPath: string;
  uploaderId: string;
  createdAt: string;
}

// ===========================================
// API Response Types
// ===========================================


// ===========================================
// Helper Functions
// ===========================================

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * Generic fetch function for API calls (exported for backward compatibility)
 */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return fetchApi<T>(path, options);
}

// ===========================================
// Users API
// ===========================================

export const usersApi = {
  list: () => fetchApi<{ users: User[] }>("/users"),
  
  get: (id: string) => fetchApi<{ user: User }>(`/users/${id}`),
  
  getByEmail: (email: string) => 
    fetchApi<{ user: User }>(`/users/email/${encodeURIComponent(email)}`),
  
  create: (data: { id: string; email: string; name: string; avatarUrl?: string }) =>
    fetchApi<{ user: User }>("/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: { name?: string; avatarUrl?: string }) =>
    fetchApi<{ user: User }>(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    fetchApi<{ success: boolean }>(`/users/${id}`, {
      method: "DELETE",
    }),
};

// ===========================================
// Wiki API
// ===========================================

export const wikiApi = {
  listPages: () => fetchApi<{ pages: Page[] }>("/wiki"),

  searchPages: (query: string) =>
    fetchApi<{ pages: Page[] }>(`/wiki/search?q=${encodeURIComponent(query)}`),
  
  getPage: (id: string) => 
    fetchApi<{ page: Page; blocks: Block[] }>(`/wiki/${id}`),
  
  createPage: (data: { title: string; parentId?: string; authorId: string }) =>
    fetchApi<{ page: Page }>("/wiki", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  
  updatePage: (id: string, data: { title?: string }) =>
    fetchApi<{ page: Page }>(`/wiki/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  
  deletePage: (id: string) =>
    fetchApi<{ success: boolean }>(`/wiki/${id}`, {
      method: "DELETE",
    }),
  
  createBlock: (data: {
    pageId: string;
    type: string;
    content?: string;
    properties?: Record<string, unknown>;
    sortOrder: number;
  }) =>
    fetchApi<{ block: Block }>("/wiki/blocks", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  
  deleteBlock: (id: string) =>
    fetchApi<{ success: boolean }>(`/wiki/blocks/${id}`, {
      method: "DELETE",
    }),
};

// ===========================================
// Meetings API
// ===========================================

export const meetingsApi = {
  list: () => fetchApi<{ meetings: Meeting[] }>("/meetings"),
  
  get: (id: string) =>
    fetchApi<{ meeting: Meeting; transcripts: Transcript[]; summaries: Summary[] }>(
      `/meetings/${id}`
    ),
  
  create: (data: { title: string; creatorId: string; scheduledAt?: string }) =>
    fetchApi<{ meeting: Meeting }>("/meetings", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: { title?: string; status?: "scheduled" | "active" | "ended" }) =>
    fetchApi<{ meeting: Meeting }>(`/meetings/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    fetchApi<{ success: boolean }>(`/meetings/${id}`, {
      method: "DELETE",
    }),
};

// ===========================================
// LiveKit API
// ===========================================

export const livekitApi = {
  getToken: (data: {
    roomName: string;
    participantName: string;
    participantIdentity: string;
  }) =>
    fetchApi<{ token: string }>("/livekit/token", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  
  listRooms: () => fetchApi<{ rooms: unknown[] }>("/livekit/rooms"),
  
  createRoom: (data: { name: string; emptyTimeout?: number; maxParticipants?: number }) =>
    fetchApi<{ room: unknown }>("/livekit/rooms", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  
  deleteRoom: (name: string) =>
    fetchApi<{ success: boolean }>(`/livekit/rooms/${name}`, {
      method: "DELETE",
    }),
  
  listParticipants: (roomName: string) =>
    fetchApi<{ participants: unknown[] }>(`/livekit/rooms/${roomName}/participants`),
};

// ===========================================
// Files API
// ===========================================

export const filesApi = {
  list: () => fetchApi<{ files: FileMetadata[] }>("/files"),
  
  get: (id: string) => fetchApi<{ file: FileMetadata }>(`/files/${id}`),
  
  getDownloadUrl: (id: string) => fetchApi<{ url: string }>(`/files/${id}/download`),
  
  upload: async (file: Blob, uploaderId: string): Promise<{ file: FileMetadata }> => {
    const formData = new FormData();
    formData.append("file", file, "upload.bin");
    formData.append("uploaderId", uploaderId);

    const response = await fetch(`${API_BASE}/files/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },
  
  delete: (id: string) =>
    fetchApi<{ success: boolean }>(`/files/${id}`, {
      method: "DELETE",
    }),
};

// ===========================================
// React Query Hooks
// ===========================================

const queryKeys = {
  users: ["users"] as const,
  meetings: ["meetings"] as const,
  meeting: (id: string) => ["meetings", id] as const,
  wikiPages: ["wiki", "pages"] as const,
  wikiPage: (id: string) => ["wiki", "pages", id] as const,
};

export function useMeetingsQuery() {
  return useQuery({
    queryKey: queryKeys.meetings,
    queryFn: () => meetingsApi.list(),
  });
}

export function useCreateMeetingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meetingsApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.meetings });
    },
  });
}

export function useWikiPagesQuery() {
  return useQuery({
    queryKey: queryKeys.wikiPages,
    queryFn: () => wikiApi.listPages(),
  });
}

export function useWikiPageQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.wikiPage(id),
    queryFn: () => wikiApi.getPage(id),
    enabled: Boolean(id),
  });
}

