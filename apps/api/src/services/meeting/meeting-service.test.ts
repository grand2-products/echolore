import { beforeEach, describe, expect, it, vi } from "vitest";
import { blocks, type Meeting, summaries } from "../../db/schema.js";
import { createMeetingSummaryWikiArtifacts, MEETING_NOTES_PAGE_ID } from "./meeting-service.js";

const { dbMock, createPageWithAccessDefaultsTxMock } = vi.hoisted(() => {
  const selectFromWhereMock = vi.fn();
  return {
    dbMock: {
      transaction: vi.fn(),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: selectFromWhereMock,
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async () => undefined),
      })),
      _selectFromWhereMock: selectFromWhereMock,
    },
    createPageWithAccessDefaultsTxMock: vi.fn(),
  };
});

vi.mock("../../db/index.js", () => ({
  db: dbMock,
}));

vi.mock("../../repositories/wiki/wiki-repository.js", () => ({
  createPageWithAccessDefaultsTx: createPageWithAccessDefaultsTxMock,
}));

vi.mock("../wiki/space-service.js", () => ({
  GENERAL_SPACE_ID: "00000000-0000-0000-0000-000000000001",
}));

describe("meeting-service", () => {
  beforeEach(() => {
    dbMock.transaction.mockReset();
    dbMock.select.mockClear();
    dbMock.insert.mockClear();
    dbMock._selectFromWhereMock.mockReset();
    createPageWithAccessDefaultsTxMock.mockReset();
    vi.restoreAllMocks();
    // Default: Meeting Notes page already exists
    dbMock._selectFromWhereMock.mockResolvedValue([{ id: MEETING_NOTES_PAGE_ID }]);
  });

  it("creates summary, wiki page, and blocks in a single transaction", async () => {
    const summaryRecord = {
      id: "summary_1",
      meetingId: "meeting_1",
      content: "Summary body",
      createdAt: new Date("2026-03-11T00:00:00.000Z"),
    };
    const pageRecord = {
      id: "page_1",
      title: "Planning - AI Summary",
      parentId: MEETING_NOTES_PAGE_ID,
      authorId: "user_1",
      createdAt: new Date("2026-03-11T00:00:00.000Z"),
      updatedAt: new Date("2026-03-11T00:00:00.000Z"),
    };

    const insertMock = vi.fn((table: unknown) => {
      if (table === summaries) {
        return {
          values: vi.fn(() => ({
            returning: vi.fn(async () => [summaryRecord]),
          })),
        };
      }

      if (table === blocks) {
        return {
          values: vi.fn(async () => undefined),
        };
      }

      throw new Error("Unexpected table");
    });

    dbMock.transaction.mockImplementation(
      async (callback: (tx: { insert: typeof insertMock }) => unknown) =>
        callback({ insert: insertMock })
    );
    createPageWithAccessDefaultsTxMock.mockResolvedValue(pageRecord);

    const randomUuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-1111-1111-111111111111")
      .mockReturnValueOnce("22222222-2222-2222-2222-222222222222")
      .mockReturnValueOnce("33333333-3333-3333-3333-333333333333")
      .mockReturnValueOnce("44444444-4444-4444-4444-444444444444");

    const meeting: Meeting = {
      id: "meeting_1",
      title: "Planning",
      creatorId: "user_1",
      roomName: "room-a",
      status: "ended",
      startedAt: null,
      endedAt: null,
      scheduledAt: null,
      googleCalendarEventId: null,
      createdAt: new Date("2026-03-11T00:00:00.000Z"),
    };

    const result = await createMeetingSummaryWikiArtifacts(meeting, "Summary body");

    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenNthCalledWith(1, summaries);
    expect(createPageWithAccessDefaultsTxMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenNthCalledWith(2, blocks);
    expect(result).toEqual({
      summary: summaryRecord,
      wikiPage: {
        id: "page_1",
        title: "Planning - AI Summary",
      },
      reused: false,
    });
    expect(randomUuidSpy).toHaveBeenCalledTimes(4);
  });

  it("fails when the summary insert does not return a record", async () => {
    const insertMock = vi.fn((table: unknown) => {
      if (table === summaries) {
        return {
          values: vi.fn(() => ({
            returning: vi.fn(async () => []),
          })),
        };
      }

      return {
        values: vi.fn(() => ({
          returning: vi.fn(async () => []),
        })),
      };
    });

    dbMock.transaction.mockImplementation(
      async (callback: (tx: { insert: typeof insertMock }) => unknown) =>
        callback({ insert: insertMock })
    );

    const meeting: Meeting = {
      id: "meeting_1",
      title: "Planning",
      creatorId: "user_1",
      roomName: "room-a",
      status: "ended",
      startedAt: null,
      endedAt: null,
      scheduledAt: null,
      googleCalendarEventId: null,
      createdAt: new Date("2026-03-11T00:00:00.000Z"),
    };

    await expect(createMeetingSummaryWikiArtifacts(meeting, "Summary body")).rejects.toThrow(
      "Failed to create summary"
    );
  });
});
