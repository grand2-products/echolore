import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockListMeetingsByUser, mockGetMeetingById, mockListFinalTranscriptSegmentsByMeeting } =
  vi.hoisted(() => ({
    mockListMeetingsByUser: vi.fn(),
    mockGetMeetingById: vi.fn(),
    mockListFinalTranscriptSegmentsByMeeting: vi.fn(),
  }));

vi.mock("../../repositories/meeting/meeting-repository.js", () => ({
  listMeetingsByUser: mockListMeetingsByUser,
  getMeetingById: mockGetMeetingById,
}));

vi.mock("../../repositories/meeting/meeting-realtime-repository.js", () => ({
  listFinalTranscriptSegmentsByMeeting: mockListFinalTranscriptSegmentsByMeeting,
}));

import type { SessionUser } from "../../lib/auth.js";
import {
  createMeetingTranscriptLookupTool,
  createRecentMeetingsTool,
} from "./aituber-meeting-tools.js";

const ownerUser: SessionUser = {
  id: "user-1",
  email: "owner@test.com",
  name: "Owner",
  role: UserRole.Member,
};

const otherUser: SessionUser = {
  id: "user-2",
  email: "other@test.com",
  name: "Other",
  role: UserRole.Member,
};

const adminUser: SessionUser = {
  id: "admin-1",
  email: "admin@test.com",
  name: "Admin",
  role: UserRole.Admin,
};

// Exercise the tool through `.invoke(args)` so its zod schema runs too. The
// invoke generic is complex, so accept it loosely here.
// biome-ignore lint/suspicious/noExplicitAny: DynamicStructuredTool.invoke has a complex generic signature
async function runTool(tool: { invoke: (a: any) => Promise<unknown> }, args: unknown) {
  return (await tool.invoke(args)) as string;
}

describe("createRecentMeetingsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the viewer's own recent meetings scoped to their id", async () => {
    mockListMeetingsByUser.mockResolvedValue([
      {
        id: "m1",
        title: "Sprint Planning",
        status: "finished",
        createdAt: new Date("2026-05-20T09:00:00Z"),
      },
    ]);

    const tool = createRecentMeetingsTool(ownerUser);
    const result = await runTool(tool, { limit: 5 });

    expect(mockListMeetingsByUser).toHaveBeenCalledWith("user-1", { limit: 5 });
    expect(result).toContain("Sprint Planning");
    expect(result).toContain("id: m1");
    expect(result).toContain("2026-05-20");
  });

  it("reports no meetings when the list is empty", async () => {
    mockListMeetingsByUser.mockResolvedValue([]);

    const tool = createRecentMeetingsTool(ownerUser);
    const result = await runTool(tool, {});

    expect(result).toBe("You have no recent meetings.");
  });

  it("escapes XML-like tags in meeting titles", async () => {
    mockListMeetingsByUser.mockResolvedValue([
      {
        id: "m1",
        title: "<script>alert(1)</script>",
        status: "finished",
        createdAt: new Date("2026-05-20T09:00:00Z"),
      },
    ]);

    const tool = createRecentMeetingsTool(ownerUser);
    const result = await runTool(tool, {});

    expect(result).not.toContain("<script>");
  });
});

describe("createMeetingTranscriptLookupTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the transcript for a meeting the viewer owns", async () => {
    mockGetMeetingById.mockResolvedValue({
      id: "m1",
      title: "1on1",
      creatorId: "user-1",
    });
    mockListFinalTranscriptSegmentsByMeeting.mockResolvedValue([
      { speakerLabel: "Alice", content: "Hello" },
      { speakerLabel: "Bob", content: "Hi there" },
    ]);

    const tool = createMeetingTranscriptLookupTool(ownerUser);
    const result = await runTool(tool, { meetingId: "m1" });

    expect(result).toContain("# 1on1");
    expect(result).toContain("[Alice] Hello");
    expect(result).toContain("[Bob] Hi there");
  });

  it("denies access when the viewer is neither creator nor admin", async () => {
    mockGetMeetingById.mockResolvedValue({
      id: "m1",
      title: "1on1",
      creatorId: "user-1",
    });

    const tool = createMeetingTranscriptLookupTool(otherUser);
    const result = await runTool(tool, { meetingId: "m1" });

    expect(result).toBe("You do not have permission to read this meeting's transcript.");
    expect(mockListFinalTranscriptSegmentsByMeeting).not.toHaveBeenCalled();
  });

  it("allows an admin to read any meeting's transcript", async () => {
    mockGetMeetingById.mockResolvedValue({
      id: "m1",
      title: "Board",
      creatorId: "someone-else",
    });
    mockListFinalTranscriptSegmentsByMeeting.mockResolvedValue([
      { speakerLabel: "Chair", content: "Order" },
    ]);

    const tool = createMeetingTranscriptLookupTool(adminUser);
    const result = await runTool(tool, { meetingId: "m1" });

    expect(result).toContain("[Chair] Order");
  });

  it("returns not-found when the meeting does not exist", async () => {
    mockGetMeetingById.mockResolvedValue(null);

    const tool = createMeetingTranscriptLookupTool(ownerUser);
    const result = await runTool(tool, { meetingId: "ghost" });

    expect(result).toBe("Meeting not found.");
    expect(mockListFinalTranscriptSegmentsByMeeting).not.toHaveBeenCalled();
  });

  it("reports when an owned meeting has no transcript yet", async () => {
    mockGetMeetingById.mockResolvedValue({
      id: "m1",
      title: "Empty",
      creatorId: "user-1",
    });
    mockListFinalTranscriptSegmentsByMeeting.mockResolvedValue([]);

    const tool = createMeetingTranscriptLookupTool(ownerUser);
    const result = await runTool(tool, { meetingId: "m1" });

    expect(result).toContain("No transcript is available");
  });
});
