import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Meeting } from "../../db/schema.js";
import { createMeetingSummaryWikiArtifacts, MEETING_NOTES_PAGE_ID } from "./meeting-service.js";

const { dbMock, createPageWithAccessDefaultsTxMock } = vi.hoisted(() => {
  const selectExecuteTakeFirstMock = vi.fn();
  const transactionExecuteMock = vi.fn();
  return {
    dbMock: {
      transaction: vi.fn(() => ({
        execute: transactionExecuteMock,
      })),
      selectFrom: vi.fn(() => ({
        select: vi.fn(() => ({
          where: vi.fn(() => ({
            executeTakeFirst: selectExecuteTakeFirstMock,
          })),
        })),
      })),
      _selectExecuteTakeFirstMock: selectExecuteTakeFirstMock,
      _transactionExecuteMock: transactionExecuteMock,
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
    dbMock._transactionExecuteMock.mockReset();
    dbMock._selectExecuteTakeFirstMock.mockReset();
    dbMock.selectFrom.mockClear();
    createPageWithAccessDefaultsTxMock.mockReset();
    vi.restoreAllMocks();
    // Default: Meeting Notes page already exists
    dbMock._selectExecuteTakeFirstMock.mockResolvedValue({ id: MEETING_NOTES_PAGE_ID });
  });

  it("creates summary, wiki page, and blocks in a single transaction", async () => {
    const summaryRecord = {
      id: "summary_1",
      meeting_id: "meeting_1",
      content: "Summary body",
      created_at: new Date("2026-03-11T00:00:00.000Z"),
    };
    const pageRecord = {
      id: "page_1",
      title: "Planning - AI Summary",
      parent_id: MEETING_NOTES_PAGE_ID,
      author_id: "user_1",
      created_at: new Date("2026-03-11T00:00:00.000Z"),
      updated_at: new Date("2026-03-11T00:00:00.000Z"),
    };

    const insertedTables: string[] = [];
    const insertMock = vi.fn((table: string) => {
      insertedTables.push(table);
      if (table === "summaries") {
        return {
          values: vi.fn(() => ({
            returningAll: vi.fn(() => ({
              executeTakeFirst: vi.fn(async () => summaryRecord),
            })),
          })),
        };
      }

      if (table === "blocks") {
        return {
          values: vi.fn(() => ({
            execute: vi.fn(async () => undefined),
          })),
        };
      }

      throw new Error("Unexpected table");
    });

    dbMock._transactionExecuteMock.mockImplementation(
      async (callback: (tx: { insertInto: typeof insertMock }) => unknown) =>
        callback({ insertInto: insertMock })
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
      creator_id: "user_1",
      room_name: "room-a",
      status: "ended",
      started_at: null,
      ended_at: null,
      scheduled_at: null,
      google_calendar_event_id: null,
      created_at: new Date("2026-03-11T00:00:00.000Z"),
    };

    const result = await createMeetingSummaryWikiArtifacts(meeting, "Summary body");

    expect(dbMock._transactionExecuteMock).toHaveBeenCalledTimes(1);
    expect(insertedTables[0]).toBe("summaries");
    expect(createPageWithAccessDefaultsTxMock).toHaveBeenCalledTimes(1);
    expect(insertedTables[1]).toBe("blocks");
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
    const insertMock = vi.fn((table: string) => {
      if (table === "summaries") {
        return {
          values: vi.fn(() => ({
            returningAll: vi.fn(() => ({
              executeTakeFirst: vi.fn(async () => undefined),
            })),
          })),
        };
      }

      return {
        values: vi.fn(() => ({
          returningAll: vi.fn(() => ({
            executeTakeFirst: vi.fn(async () => undefined),
          })),
        })),
      };
    });

    dbMock._transactionExecuteMock.mockImplementation(
      async (callback: (tx: { insertInto: typeof insertMock }) => unknown) =>
        callback({ insertInto: insertMock })
    );

    const meeting: Meeting = {
      id: "meeting_1",
      title: "Planning",
      creator_id: "user_1",
      room_name: "room-a",
      status: "ended",
      started_at: null,
      ended_at: null,
      scheduled_at: null,
      google_calendar_event_id: null,
      created_at: new Date("2026-03-11T00:00:00.000Z"),
    };

    await expect(createMeetingSummaryWikiArtifacts(meeting, "Summary body")).rejects.toThrow(
      "Failed to create summary"
    );
  });
});
