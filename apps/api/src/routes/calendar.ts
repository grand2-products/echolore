import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../lib/api-error.js";
import { auditAction, extractRequestMeta, writeAuditLog } from "../lib/audit.js";
import type { AppEnv } from "../lib/auth.js";
import {
  disconnect,
  getAuthUrl,
  handleCallback,
  isConnected,
} from "../services/calendar/google-calendar-auth-service.js";
import {
  importEventAsMeeting,
  listCalendarContacts,
  listUpcomingEvents,
} from "../services/calendar/google-calendar-sync-service.js";

export const calendarRoutes = new Hono<AppEnv>();

// GET /api/calendar/status
calendarRoutes.get(
  "/status",
  withErrorHandler("CALENDAR_STATUS_FAILED", "Failed to check calendar status"),
  async (c) => {
    const user = c.get("user");
    const connected = await isConnected(user.id);
    return c.json({ connected });
  }
);

// GET /api/calendar/connect
calendarRoutes.get(
  "/connect",
  withErrorHandler("CALENDAR_CONNECT_FAILED", "Failed to start calendar connection"),
  async (c) => {
    const user = c.get("user");
    const url = await getAuthUrl(user.id);
    return c.redirect(url);
  }
);

// GET /api/calendar/callback
// NOTE: This route has complex error handling (redirects, not jsonError) — kept as-is
calendarRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state"); // userId
  const errorParam = c.req.query("error");

  const webBaseUrl = process.env.CORS_ORIGIN || "http://localhost:3000";

  if (errorParam) {
    return c.redirect(
      `${webBaseUrl}/settings?calendar=error&reason=${encodeURIComponent(errorParam)}`
    );
  }

  if (!code || !state) {
    return c.redirect(`${webBaseUrl}/settings?calendar=error&reason=missing_params`);
  }

  try {
    await handleCallback(code, state);
    await writeAuditLog({
      actorUserId: state,
      actorEmail: null,
      action: "calendar.connect",
      resourceType: "google-calendar",
      resourceId: state,
      metadata: {},
      ...extractRequestMeta(c),
    });
    return c.redirect(`${webBaseUrl}/settings?calendar=connected`);
  } catch (error) {
    console.error("Error handling calendar callback:", error);
    return c.redirect(`${webBaseUrl}/settings?calendar=error&reason=callback_failed`);
  }
});

// POST /api/calendar/disconnect
calendarRoutes.post(
  "/disconnect",
  withErrorHandler("CALENDAR_DISCONNECT_FAILED", "Failed to disconnect calendar"),
  async (c) => {
    const user = c.get("user");
    await disconnect(user.id);
    await auditAction(c, "calendar.disconnect", "google-calendar", user.id);
    return c.json({ success: true });
  }
);

// GET /api/calendar/events
calendarRoutes.get(
  "/events",
  withErrorHandler("CALENDAR_EVENTS_FAILED", "Failed to list calendar events"),
  async (c) => {
    const user = c.get("user");
    const days = Math.min(Number(c.req.query("days")) || 7, 30);
    const events = await listUpcomingEvents(user.id, days);
    return c.json({ events });
  }
);

// GET /api/calendar/contacts
calendarRoutes.get(
  "/contacts",
  withErrorHandler("CALENDAR_CONTACTS_FAILED", "Failed to list calendar contacts"),
  async (c) => {
    const user = c.get("user");
    const contacts = await listCalendarContacts(user.id);
    return c.json({ contacts });
  }
);

// POST /api/calendar/events/:eventId/import
calendarRoutes.post(
  "/events/:eventId/import",
  withErrorHandler("CALENDAR_IMPORT_FAILED", "Failed to import calendar event"),
  async (c) => {
    const user = c.get("user");
    const { eventId } = c.req.param();
    const meeting = await importEventAsMeeting(user.id, eventId);
    if (!meeting) {
      return jsonError(c, 500, "CALENDAR_IMPORT_FAILED", "Failed to import calendar event");
    }
    await auditAction(c, "calendar.import", "meeting", meeting.id, { calendarEventId: eventId });
    return c.json({ meeting }, 201);
  }
);
