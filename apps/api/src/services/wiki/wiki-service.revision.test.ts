import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getPageByIdMock,
  getPageBlocksMock,
  getLatestRevisionByPageIdMock,
  getNextRevisionNumberMock,
  createRevisionMock,
} = vi.hoisted(() => ({
  getPageByIdMock: vi.fn(),
  getPageBlocksMock: vi.fn(),
  getLatestRevisionByPageIdMock: vi.fn(),
  getNextRevisionNumberMock: vi.fn(),
  createRevisionMock: vi.fn(),
}));

vi.mock("../../repositories/wiki/wiki-repository.js", () => ({
  getPageById: getPageByIdMock,
  getPageBlocks: getPageBlocksMock,
  // The wiki-service module pulls several other exports from this repository.
  // None of them are exercised by createPageRevision, but the module import
  // resolves them at load time — stub the surface with no-op vi.fns so the
  // module can be imported.
  createPageWithAccessDefaults: vi.fn(),
  findPagesWithExplicitDeny: vi.fn(),
  getPageParentId: vi.fn(),
  listBlockContentsByPageIds: vi.fn(),
  listPagesByIds: vi.fn(),
  listPagesOrderedByUpdatedAt: vi.fn(),
  restorePageRevision: vi.fn(),
  searchByVectorForUser: vi.fn(),
  searchPagesLexically: vi.fn(),
}));

vi.mock("../../repositories/wiki/revision-repository.js", () => ({
  createRevision: createRevisionMock,
  getLatestRevisionByPageId: getLatestRevisionByPageIdMock,
  getNextRevisionNumber: getNextRevisionNumberMock,
  getRevisionById: vi.fn(),
  listRevisionsByPageId: vi.fn(),
}));

import { createPageRevision } from "./wiki-service.js";

const PAGE = {
  id: "page_1",
  title: "Title",
  spaceId: "space_1",
  parentId: null,
  authorId: "user_1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  deletedAt: null,
};

const BLOCKS = [
  {
    id: "b1",
    pageId: "page_1",
    type: "paragraph",
    content: "Hello",
    properties: null,
    sortOrder: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  },
];

const EXPECTED_SNAPSHOT = [{ type: "paragraph", content: "Hello", properties: null, sortOrder: 0 }];

describe("createPageRevision", () => {
  beforeEach(() => {
    getPageByIdMock.mockReset();
    getPageBlocksMock.mockReset();
    getLatestRevisionByPageIdMock.mockReset();
    getNextRevisionNumberMock.mockReset();
    createRevisionMock.mockReset();
  });

  it("creates a new revision when no prior revision exists", async () => {
    getPageByIdMock.mockResolvedValue(PAGE);
    getPageBlocksMock.mockResolvedValue(BLOCKS);
    getLatestRevisionByPageIdMock.mockResolvedValue(null);
    getNextRevisionNumberMock.mockResolvedValue(1);
    createRevisionMock.mockImplementation(async (data) => ({ ...data }));

    const result = await createPageRevision("page_1", "user_1");

    expect(createRevisionMock).toHaveBeenCalledTimes(1);
    expect(createRevisionMock.mock.calls[0]?.[0]).toMatchObject({
      pageId: "page_1",
      revisionNumber: 1,
      title: "Title",
      blocks: EXPECTED_SNAPSHOT,
      authorId: "user_1",
    });
    expect(result).toMatchObject({ revisionNumber: 1 });
  });

  it("skips creation and returns the existing revision when title and blocks match", async () => {
    const existing = {
      id: "rev_existing",
      pageId: "page_1",
      revisionNumber: 5,
      title: "Title",
      blocks: EXPECTED_SNAPSHOT,
      authorId: "other_user",
      createdAt: new Date("2025-12-31"),
    };

    getPageByIdMock.mockResolvedValue(PAGE);
    getPageBlocksMock.mockResolvedValue(BLOCKS);
    getLatestRevisionByPageIdMock.mockResolvedValue(existing);

    const result = await createPageRevision("page_1", "user_1");

    expect(createRevisionMock).not.toHaveBeenCalled();
    expect(getNextRevisionNumberMock).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it("creates a new revision when only the title differs", async () => {
    const existing = {
      id: "rev_existing",
      pageId: "page_1",
      revisionNumber: 5,
      title: "Different Title",
      blocks: EXPECTED_SNAPSHOT,
      authorId: "other_user",
      createdAt: new Date("2025-12-31"),
    };

    getPageByIdMock.mockResolvedValue(PAGE);
    getPageBlocksMock.mockResolvedValue(BLOCKS);
    getLatestRevisionByPageIdMock.mockResolvedValue(existing);
    getNextRevisionNumberMock.mockResolvedValue(6);
    createRevisionMock.mockImplementation(async (data) => ({ ...data }));

    await createPageRevision("page_1", "user_1");

    expect(createRevisionMock).toHaveBeenCalledTimes(1);
    expect(createRevisionMock.mock.calls[0]?.[0]).toMatchObject({ revisionNumber: 6 });
  });

  it("creates a new revision when block content differs by one character", async () => {
    const existing = {
      id: "rev_existing",
      pageId: "page_1",
      revisionNumber: 5,
      title: "Title",
      blocks: [{ type: "paragraph", content: "Hell", properties: null, sortOrder: 0 }],
      authorId: "other_user",
      createdAt: new Date("2025-12-31"),
    };

    getPageByIdMock.mockResolvedValue(PAGE);
    getPageBlocksMock.mockResolvedValue(BLOCKS);
    getLatestRevisionByPageIdMock.mockResolvedValue(existing);
    getNextRevisionNumberMock.mockResolvedValue(6);
    createRevisionMock.mockImplementation(async (data) => ({ ...data }));

    await createPageRevision("page_1", "user_1");

    expect(createRevisionMock).toHaveBeenCalledTimes(1);
  });

  it("treats block snapshots with shuffled property keys as equal", async () => {
    // Simulate Postgres returning JSONB with different key insertion order
    // than the new snapshot. stableSerialize must sort keys to detect equality.
    const existing = {
      id: "rev_existing",
      pageId: "page_1",
      revisionNumber: 5,
      title: "Title",
      blocks: [
        // Note: key order differs from EXPECTED_SNAPSHOT
        { sortOrder: 0, properties: null, content: "Hello", type: "paragraph" },
      ],
      authorId: "other_user",
      createdAt: new Date("2025-12-31"),
    };

    getPageByIdMock.mockResolvedValue(PAGE);
    getPageBlocksMock.mockResolvedValue(BLOCKS);
    getLatestRevisionByPageIdMock.mockResolvedValue(existing);

    const result = await createPageRevision("page_1", "user_1");

    expect(createRevisionMock).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it("retries with a fresh revision number after a unique-constraint race", async () => {
    getPageByIdMock.mockResolvedValue(PAGE);
    getPageBlocksMock.mockResolvedValue(BLOCKS);
    // First dedup check: no match → attempt insert
    // After conflict: latest revision is the one a concurrent caller inserted,
    // but its content differs from ours so we retry with the next number
    getLatestRevisionByPageIdMock.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "rev_race",
      pageId: "page_1",
      revisionNumber: 1,
      title: "Title",
      blocks: [{ type: "paragraph", content: "DIFFERENT", properties: null, sortOrder: 0 }],
      authorId: "other_user",
      createdAt: new Date(),
    });
    getNextRevisionNumberMock.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    const uniqueErr = Object.assign(new Error("duplicate key"), { code: "23505" });
    createRevisionMock.mockRejectedValueOnce(uniqueErr).mockImplementation(async (data) => ({
      ...data,
    }));

    const result = await createPageRevision("page_1", "user_1");

    expect(createRevisionMock).toHaveBeenCalledTimes(2);
    expect(createRevisionMock.mock.calls[1]?.[0]).toMatchObject({ revisionNumber: 2 });
    expect(result).toMatchObject({ revisionNumber: 2 });
  });

  it("returns the just-inserted revision on race if dedup now matches", async () => {
    // A concurrent caller raced ahead and inserted a revision with the SAME
    // content. After unique-constraint failure, the next dedup check matches
    // that revision and we return it without further inserts.
    const winnerRevision = {
      id: "rev_winner",
      pageId: "page_1",
      revisionNumber: 1,
      title: "Title",
      blocks: EXPECTED_SNAPSHOT,
      authorId: "other_user",
      createdAt: new Date(),
    };

    getPageByIdMock.mockResolvedValue(PAGE);
    getPageBlocksMock.mockResolvedValue(BLOCKS);
    getLatestRevisionByPageIdMock.mockResolvedValueOnce(null).mockResolvedValueOnce(winnerRevision);
    getNextRevisionNumberMock.mockResolvedValueOnce(1);

    const uniqueErr = Object.assign(new Error("duplicate key"), { code: "23505" });
    createRevisionMock.mockRejectedValueOnce(uniqueErr);

    const result = await createPageRevision("page_1", "user_1");

    expect(createRevisionMock).toHaveBeenCalledTimes(1);
    expect(result).toBe(winnerRevision);
  });

  it("rethrows non-unique-constraint errors", async () => {
    getPageByIdMock.mockResolvedValue(PAGE);
    getPageBlocksMock.mockResolvedValue(BLOCKS);
    getLatestRevisionByPageIdMock.mockResolvedValue(null);
    getNextRevisionNumberMock.mockResolvedValue(1);

    const fkErr = Object.assign(new Error("foreign key violation"), { code: "23503" });
    createRevisionMock.mockRejectedValue(fkErr);

    await expect(createPageRevision("page_1", "user_1")).rejects.toThrow("foreign key");
    expect(createRevisionMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the page does not exist", async () => {
    getPageByIdMock.mockResolvedValue(null);

    await expect(createPageRevision("missing", "user_1")).rejects.toThrow(
      "Page not found: missing"
    );
    expect(createRevisionMock).not.toHaveBeenCalled();
  });
});
