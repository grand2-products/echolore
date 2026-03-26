import { type calendar_v3, google } from "googleapis";
import { ONE_DAY_MS, ONE_HOUR_MS } from "../../lib/time.js";
import {
  createMeeting,
  getMeetingById,
  updateMeeting,
} from "../../repositories/meeting/meeting-repository.js";
import { getAuthedClient, isConnected } from "./google-calendar-auth-service.js";

export async function syncMeetingToCalendar(
  meetingId: string,
  userId: string,
  options?: { attendeeEmails?: string[] }
): Promise<string | null> {
  if (!(await isConnected(userId))) return null;

  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;

  const { client, calendarId } = await getAuthedClient(userId);
  const calendar = google.calendar({ version: "v3", auth: client });

  const startTime = meeting.scheduledAt || meeting.createdAt;
  const endTime = new Date(startTime.getTime() + ONE_HOUR_MS);

  const attendees = options?.attendeeEmails?.length
    ? options.attendeeEmails.map((email) => ({ email }))
    : undefined;

  const event: calendar_v3.Schema$Event = {
    summary: meeting.title,
    start: { dateTime: startTime.toISOString() },
    end: { dateTime: endTime.toISOString() },
    description: `Meeting room: ${meeting.roomName}`,
    attendees,
  };

  const res = await calendar.events.insert({
    calendarId,
    requestBody: event,
    sendUpdates: attendees ? "all" : "none",
  });

  const eventId = res.data.id;
  if (eventId) {
    await updateMeeting(meetingId, { googleCalendarEventId: eventId });
  }

  return eventId || null;
}

export async function updateCalendarEvent(meetingId: string, userId: string): Promise<void> {
  if (!(await isConnected(userId))) return;

  const meeting = await getMeetingById(meetingId);
  if (!meeting?.googleCalendarEventId) return;

  const { client, calendarId } = await getAuthedClient(userId);
  const calendar = google.calendar({ version: "v3", auth: client });

  const startTime = meeting.scheduledAt || meeting.createdAt;
  const endTime = new Date(startTime.getTime() + ONE_HOUR_MS);

  await calendar.events.update({
    calendarId,
    eventId: meeting.googleCalendarEventId,
    requestBody: {
      summary: meeting.title,
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
    },
  });
}

export async function deleteCalendarEvent(meetingId: string, userId: string): Promise<void> {
  if (!(await isConnected(userId))) return;

  const meeting = await getMeetingById(meetingId);
  if (!meeting?.googleCalendarEventId) return;

  const { client, calendarId } = await getAuthedClient(userId);
  const calendar = google.calendar({ version: "v3", auth: client });

  try {
    await calendar.events.delete({
      calendarId,
      eventId: meeting.googleCalendarEventId,
    });
  } catch {
    // Event may already be deleted
  }
}

export interface CalendarEventDto {
  id: string;
  summary: string;
  start: string;
  end: string;
  description: string | null;
  htmlLink: string | null;
}

export async function listUpcomingEvents(userId: string, days = 7): Promise<CalendarEventDto[]> {
  const { client, calendarId } = await getAuthedClient(userId);
  const calendar = google.calendar({ version: "v3", auth: client });

  const now = new Date();
  const until = new Date(now.getTime() + days * ONE_DAY_MS);

  const res = await calendar.events.list({
    calendarId,
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  return (res.data.items || []).map((e) => ({
    id: e.id || "",
    summary: e.summary || "(no title)",
    start: e.start?.dateTime || e.start?.date || "",
    end: e.end?.dateTime || e.end?.date || "",
    description: e.description || null,
    htmlLink: e.htmlLink || null,
  }));
}

export interface CalendarContactDto {
  email: string;
  displayName: string | null;
}

export async function listCalendarContacts(
  userId: string,
  days = 30
): Promise<CalendarContactDto[]> {
  const { client, calendarId } = await getAuthedClient(userId);
  const calendar = google.calendar({ version: "v3", auth: client });

  const now = new Date();
  const since = new Date(now.getTime() - days * ONE_DAY_MS);

  const res = await calendar.events.list({
    calendarId,
    timeMin: since.toISOString(),
    timeMax: now.toISOString(),
    singleEvents: true,
    maxResults: 250,
    fields: "items(attendees(email,displayName,self))",
  });

  const seen = new Map<string, string | null>();
  for (const event of res.data.items || []) {
    for (const a of event.attendees || []) {
      if (a.email && !a.self && !seen.has(a.email)) {
        seen.set(a.email, a.displayName || null);
      }
    }
  }

  return Array.from(seen.entries())
    .map(([email, displayName]) => ({ email, displayName }))
    .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
}

export async function importEventAsMeeting(userId: string, eventId: string) {
  const { client, calendarId } = await getAuthedClient(userId);
  const calendar = google.calendar({ version: "v3", auth: client });

  const res = await calendar.events.get({ calendarId, eventId });
  const event = res.data;

  const id = crypto.randomUUID();
  const roomName = `room-${id}`;
  const scheduledAt = event.start?.dateTime
    ? new Date(event.start.dateTime)
    : event.start?.date
      ? new Date(event.start.date)
      : null;

  const newMeeting = await createMeeting({
    id,
    title: event.summary || "Imported Meeting",
    creatorId: userId,
    roomName,
    status: "scheduled",
    scheduledAt,
    googleCalendarEventId: eventId,
    createdAt: new Date(),
  });

  return newMeeting;
}
