import { buildApiUrl, fetchApi } from "./fetch";
import type { CalendarEvent, Meeting } from "./types";

export const calendarApi = {
  status: () => fetchApi<{ connected: boolean }>("/calendar/status"),

  getConnectUrl: () => buildApiUrl("/calendar/connect"),

  disconnect: () =>
    fetchApi<{ success: boolean }>("/calendar/disconnect", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  listEvents: (days?: number) =>
    fetchApi<{ events: CalendarEvent[] }>(`/calendar/events${days ? `?days=${days}` : ""}`),

  importEvent: (eventId: string) =>
    fetchApi<{ meeting: Meeting }>(`/calendar/events/${encodeURIComponent(eventId)}/import`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
