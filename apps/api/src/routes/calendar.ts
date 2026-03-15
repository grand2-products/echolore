import { Hono } from "hono";
import type { AppEnv } from "../lib/auth.js";
import { jsonError, withErrorHandler } from "../lib/api-error.js";
import { auditAction, extractRequestMeta, writeAuditLog } from "../lib/audit.js";
import {
  getAuthUrl,
  handleCallback,
  disconnect,
  isConnected,
} from "../services/calendar/google-calendar-auth-service.js";
import {
  listUpcomingEvents,
  importEventAsMeeting,
} from "../services/calendar/google-calendar-sync-service.js";

export const calendarRoutes = new Hono<AppEnv>();

// GET /api/calendar/status
calendarRoutes.get("/status", withErrorHandler(async (c) => {
  const user = c.get("user");
  const connected = await isConnected(user.id);
  return c.json({ connected });
}, "CALENDAR_STATUS_FAILED", "Failed to check calendar status"));

// GET /api/calendar/connect
calendarRoutes.get("/connect", withErrorHandler(async (c) => {
  const user = c.get("user");
  const url = await getAuthUrl(user.id);
  return c.redirect(url);
}, "CALENDAR_CONNECT_FAILED", "Failed to start calendar connection"));

// GET /api/calendar/callback
// NOTE: This route has complex error handling (redirects, not jsonError) — kept as-is
calendarRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state"); // userId
  const errorParam = c.req.query("error");

  const webBaseUrl = process.env.CORS_ORIGIN || "http://localhost:3000";

  if (errorParam) {
    return c.redirect(`${webBaseUrl}/settings?calendar=error&reason=${encodeURIComponent(errorParam)}`);
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
calendarRoutes.post("/disconnect", withErrorHandler(async (c) => {
  const user = c.get("user");
  await disconnect(user.id);
  await auditAction(c, "calendar.disconnect", "google-calendar", user.id);
  return c.json({ success: true });
}, "CALENDAR_DISCONNECT_FAILED", "Failed to disconnect calendar"));

// GET /api/calendar/events
calendarRoutes.get("/events", withErrorHandler(async (c) => {
  const user = c.get("user");
  const days = Math.min(Number(c.req.query("days")) || 7, 30);
  const events = await listUpcomingEvents(user.id, days);
  return c.json({ events });
}, "CALENDAR_EVENTS_FAILED", "Failed to list calendar events"));

// POST /api/calendar/events/:eventId/import
calendarRoutes.post("/events/:eventId/import", withErrorHandler(async (c) => {
  const user = c.get("user");
  const { eventId } = c.req.param();
  const meeting = await importEventAsMeeting(user.id, eventId);
  if (!meeting) {
    return jsonError(c, 500, "CALENDAR_IMPORT_FAILED", "Failed to import calendar event");
  }
  await auditAction(c, "calendar.import", "meeting", meeting.id, { calendarEventId: eventId });
  return c.json({ meeting }, 201);
}, "CALENDAR_IMPORT_FAILED", "Failed to import calendar event"));
