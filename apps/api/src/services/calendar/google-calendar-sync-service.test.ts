import { beforeEach, describe, expect, it, vi } from "vitest";
import { meetings } from "../../db/schema.js";

const { dbMock, isConnectedMock, getAuthedClientMock } = vi.hoisted(() => {
  const selectWhereLimitMock = vi.fn();
  const updateSetWhereMock = vi.fn();
  return {
    dbMock: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: selectWhereLimitMock,
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateSetWhereMock,
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => []),
        })),
      })),
      _selectWhereLimitMock: selectWhereLimitMock,
      _updateSetWhereMock: updateSetWhereMock,
    },
    isConnectedMock: vi.fn(),
    getAuthedClientMock: vi.fn(),
  };
});

vi.mock("../../db/index.js", () => ({
  db: dbMock,
}));

vi.mock("./google-calendar-auth-service.js", () => ({
  isConnected: isConnectedMock,
  getAuthedClient: getAuthedClientMock,
}));

const calendarEventsMock = {
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
};

vi.mock("googleapis", () => ({
  google: {
    calendar: vi.fn(() => ({
      events: calendarEventsMock,
    })),
  },
}));

vi.mock("../../lib/time.js", () => ({
  ONE_HOUR_MS: 3600000,
  ONE_DAY_MS: 86400000,
}));

describe("google-calendar-sync-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    dbMock.select.mockClear();
    dbMock.update.mockClear();
    dbMock.insert.mockClear();
    dbMock._selectWhereLimitMock.mockReset();
    dbMock._updateSetWhereMock.mockReset();
    isConnectedMock.mockReset();
    getAuthedClientMock.mockReset();
    calendarEventsMock.insert.mockReset();
    calendarEventsMock.update.mockReset();
    calendarEventsMock.delete.mockReset();
    calendarEventsMock.list.mockReset();
    calendarEventsMock.get.mockReset();
  });

  describe("syncMeetingToCalendar", () => {
    it("returns null when user is not connected to Google Calendar", async () => {
      isConnectedMock.mockResolvedValue(false);

      const { syncMeetingToCalendar } = await import("./google-calendar-sync-service.js");
      const result = await syncMeetingToCalendar("meeting-1", "user-1");

      expect(result).toBeNull();
      expect(isConnectedMock).toHaveBeenCalledWith("user-1");
    });

    it("returns null when meeting is not found", async () => {
      isConnectedMock.mockResolvedValue(true);
      dbMock._selectWhereLimitMock.mockResolvedValue([]);

      const { syncMeetingToCalendar } = await import("./google-calendar-sync-service.js");
      const result = await syncMeetingToCalendar("missing-meeting", "user-1");

      expect(result).toBeNull();
    });

    it("inserts a calendar event and stores the event ID in the DB", async () => {
      isConnectedMock.mockResolvedValue(true);
      const meetingRow = {
        id: "meeting-1",
        title: "Sprint Review",
        roomName: "room-abc",
        scheduledAt: new Date("2026-03-20T10:00:00Z"),
        createdAt: new Date("2026-03-15T09:00:00Z"),
      };
      dbMock._selectWhereLimitMock.mockResolvedValue([meetingRow]);

      const fakeClient = {};
      getAuthedClientMock.mockResolvedValue({ client: fakeClient, calendarId: "primary" });
      calendarEventsMock.insert.mockResolvedValue({ data: { id: "gcal-event-123" } });
      dbMock._updateSetWhereMock.mockResolvedValue(undefined);

      const { syncMeetingToCalendar } = await import("./google-calendar-sync-service.js");
      const result = await syncMeetingToCalendar("meeting-1", "user-1");

      expect(result).toBe("gcal-event-123");
      expect(calendarEventsMock.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          requestBody: expect.objectContaining({
            summary: "Sprint Review",
          }),
          sendUpdates: "none",
        })
      );
      expect(dbMock.update).toHaveBeenCalledWith(meetings);
    });

    it("sends updates to all attendees when attendeeEmails are provided", async () => {
      isConnectedMock.mockResolvedValue(true);
      const meetingRow = {
        id: "meeting-1",
        title: "Sprint Review",
        roomName: "room-abc",
        scheduledAt: new Date("2026-03-20T10:00:00Z"),
        createdAt: new Date("2026-03-15T09:00:00Z"),
      };
      dbMock._selectWhereLimitMock.mockResolvedValue([meetingRow]);
      getAuthedClientMock.mockResolvedValue({ client: {}, calendarId: "primary" });
      calendarEventsMock.insert.mockResolvedValue({ data: { id: "gcal-event-456" } });
      dbMock._updateSetWhereMock.mockResolvedValue(undefined);

      const { syncMeetingToCalendar } = await import("./google-calendar-sync-service.js");
      const result = await syncMeetingToCalendar("meeting-1", "user-1", {
        attendeeEmails: ["alice@example.com"],
      });

      expect(result).toBe("gcal-event-456");
      expect(calendarEventsMock.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          sendUpdates: "all",
          requestBody: expect.objectContaining({
            attendees: [{ email: "alice@example.com" }],
          }),
        })
      );
    });
  });

  describe("updateCalendarEvent", () => {
    it("does nothing when user is not connected", async () => {
      isConnectedMock.mockResolvedValue(false);

      const { updateCalendarEvent } = await import("./google-calendar-sync-service.js");
      await updateCalendarEvent("meeting-1", "user-1");

      expect(getAuthedClientMock).not.toHaveBeenCalled();
    });

    it("does nothing when meeting has no googleCalendarEventId", async () => {
      isConnectedMock.mockResolvedValue(true);
      dbMock._selectWhereLimitMock.mockResolvedValue([
        { id: "meeting-1", googleCalendarEventId: null },
      ]);

      const { updateCalendarEvent } = await import("./google-calendar-sync-service.js");
      await updateCalendarEvent("meeting-1", "user-1");

      expect(calendarEventsMock.update).not.toHaveBeenCalled();
    });

    it("updates the calendar event with new meeting details", async () => {
      isConnectedMock.mockResolvedValue(true);
      const meetingRow = {
        id: "meeting-1",
        title: "Updated Sprint Review",
        googleCalendarEventId: "gcal-event-123",
        scheduledAt: new Date("2026-03-21T14:00:00Z"),
        createdAt: new Date("2026-03-15T09:00:00Z"),
      };
      dbMock._selectWhereLimitMock.mockResolvedValue([meetingRow]);
      getAuthedClientMock.mockResolvedValue({ client: {}, calendarId: "primary" });
      calendarEventsMock.update.mockResolvedValue({});

      const { updateCalendarEvent } = await import("./google-calendar-sync-service.js");
      await updateCalendarEvent("meeting-1", "user-1");

      expect(calendarEventsMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          eventId: "gcal-event-123",
          requestBody: expect.objectContaining({
            summary: "Updated Sprint Review",
          }),
        })
      );
    });
  });

  describe("deleteCalendarEvent", () => {
    it("does nothing when user is not connected", async () => {
      isConnectedMock.mockResolvedValue(false);

      const { deleteCalendarEvent } = await import("./google-calendar-sync-service.js");
      await deleteCalendarEvent("meeting-1", "user-1");

      expect(getAuthedClientMock).not.toHaveBeenCalled();
    });

    it("deletes the calendar event", async () => {
      isConnectedMock.mockResolvedValue(true);
      const meetingRow = {
        id: "meeting-1",
        googleCalendarEventId: "gcal-event-123",
      };
      dbMock._selectWhereLimitMock.mockResolvedValue([meetingRow]);
      getAuthedClientMock.mockResolvedValue({ client: {}, calendarId: "primary" });
      calendarEventsMock.delete.mockResolvedValue({});

      const { deleteCalendarEvent } = await import("./google-calendar-sync-service.js");
      await deleteCalendarEvent("meeting-1", "user-1");

      expect(calendarEventsMock.delete).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "gcal-event-123",
      });
    });

    it("silently handles errors when event is already deleted", async () => {
      isConnectedMock.mockResolvedValue(true);
      const meetingRow = {
        id: "meeting-1",
        googleCalendarEventId: "gcal-event-gone",
      };
      dbMock._selectWhereLimitMock.mockResolvedValue([meetingRow]);
      getAuthedClientMock.mockResolvedValue({ client: {}, calendarId: "primary" });
      calendarEventsMock.delete.mockRejectedValue(new Error("Not Found"));

      const { deleteCalendarEvent } = await import("./google-calendar-sync-service.js");

      await expect(deleteCalendarEvent("meeting-1", "user-1")).resolves.toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("propagates Google API errors from syncMeetingToCalendar", async () => {
      isConnectedMock.mockResolvedValue(true);
      dbMock._selectWhereLimitMock.mockResolvedValue([
        {
          id: "meeting-1",
          title: "Test",
          roomName: "room-x",
          scheduledAt: new Date(),
          createdAt: new Date(),
        },
      ]);
      getAuthedClientMock.mockResolvedValue({ client: {}, calendarId: "primary" });
      calendarEventsMock.insert.mockRejectedValue(new Error("Google API quota exceeded"));

      const { syncMeetingToCalendar } = await import("./google-calendar-sync-service.js");

      await expect(syncMeetingToCalendar("meeting-1", "user-1")).rejects.toThrow(
        "Google API quota exceeded"
      );
    });

    it("propagates Google API errors from updateCalendarEvent", async () => {
      isConnectedMock.mockResolvedValue(true);
      dbMock._selectWhereLimitMock.mockResolvedValue([
        {
          id: "meeting-1",
          title: "Test",
          googleCalendarEventId: "gcal-123",
          scheduledAt: new Date(),
          createdAt: new Date(),
        },
      ]);
      getAuthedClientMock.mockResolvedValue({ client: {}, calendarId: "primary" });
      calendarEventsMock.update.mockRejectedValue(new Error("Forbidden"));

      const { updateCalendarEvent } = await import("./google-calendar-sync-service.js");

      await expect(updateCalendarEvent("meeting-1", "user-1")).rejects.toThrow("Forbidden");
    });
  });
});
