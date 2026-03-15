import type {
  AituberCharacterDto,
  AituberMessageDto,
  AituberSessionDto,
  CreateAituberCharacterRequest,
  CreateAituberSessionRequest,
  SendAituberMessageRequest,
  UpdateAituberCharacterRequest,
} from "@echolore/shared/contracts";
import { fetchApi } from "./fetch";

export const aituberApi = {
  // Characters
  listCharacters: () => fetchApi<{ characters: AituberCharacterDto[] }>("/aituber/characters"),

  getCharacter: (id: string) =>
    fetchApi<{ character: AituberCharacterDto }>(`/aituber/characters/${id}`),

  createCharacter: (data: CreateAituberCharacterRequest) =>
    fetchApi<{ character: AituberCharacterDto }>("/aituber/characters", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateCharacter: (id: string, data: UpdateAituberCharacterRequest) =>
    fetchApi<{ character: AituberCharacterDto }>(`/aituber/characters/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteCharacter: (id: string) =>
    fetchApi<{ success: boolean }>(`/aituber/characters/${id}`, {
      method: "DELETE",
    }),

  // Sessions
  listSessions: (status?: string) =>
    fetchApi<{ sessions: AituberSessionDto[] }>(
      `/aituber/sessions${status ? `?status=${status}` : ""}`
    ),

  getSession: (id: string) => fetchApi<{ session: AituberSessionDto }>(`/aituber/sessions/${id}`),

  createSession: (data: CreateAituberSessionRequest) =>
    fetchApi<{ session: AituberSessionDto }>("/aituber/sessions", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  startSession: (id: string) =>
    fetchApi<{ session: AituberSessionDto }>(`/aituber/sessions/${id}/start`, {
      method: "POST",
    }),

  stopSession: (id: string) =>
    fetchApi<{ session: AituberSessionDto }>(`/aituber/sessions/${id}/stop`, {
      method: "POST",
    }),

  // Messages
  listMessages: (sessionId: string) =>
    fetchApi<{ messages: AituberMessageDto[] }>(`/aituber/sessions/${sessionId}/messages`),

  sendMessage: (sessionId: string, data: SendAituberMessageRequest) =>
    fetchApi<{ message: AituberMessageDto }>(`/aituber/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Token
  getViewerToken: (sessionId: string) =>
    fetchApi<{ token: string }>(`/aituber/sessions/${sessionId}/token`),
};
