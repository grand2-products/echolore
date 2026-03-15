import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, generateSuggestionsMock } = vi.hoisted(() => {
  const selectFromWhereLimitMock = vi.fn();
  const selectFromWhereOrderByMock = vi.fn(() => ({ limit: selectFromWhereLimitMock }));
  const selectFromWhereMock = vi.fn(() => ({ orderBy: selectFromWhereOrderByMock }));
  const selectFromOrderByMock = vi.fn(() => ({ limit: selectFromWhereLimitMock }));
  const selectFromMock = vi.fn(() => ({
    where: selectFromWhereMock,
    orderBy: selectFromOrderByMock,
  }));
  return {
    dbMock: {
      select: vi.fn(() => ({
        from: selectFromMock,
      })),
      _selectFromMock: selectFromMock,
      _selectFromWhereMock: selectFromWhereMock,
      _selectFromWhereLimitMock: selectFromWhereLimitMock,
      _selectFromWhereOrderByMock: selectFromWhereOrderByMock,
    },
    generateSuggestionsMock: vi.fn(),
  };
});

vi.mock("../../db/index.js", () => ({
  db: dbMock,
}));

vi.mock("../../db/schema.js", () => ({
  blocks: { pageId: "pageId", content: "content", type: "type", sortOrder: "sortOrder" },
  pages: {
    id: "id",
    title: "title",
    spaceId: "spaceId",
    deletedAt: "deletedAt",
    updatedAt: "updatedAt",
  },
}));

vi.mock("./knowledge-suggestion-service.js", () => ({
  generateSuggestions: generateSuggestionsMock,
}));

import { startKnowledgeScanLoop, stopKnowledgeScanLoop } from "./knowledge-scan-service.js";

describe("knowledge-scan-service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generateSuggestionsMock.mockReset();
    dbMock._selectFromWhereLimitMock.mockReset();
  });

  afterEach(() => {
    stopKnowledgeScanLoop();
    vi.useRealTimers();
  });

  it("starts and stops the scan loop", () => {
    startKnowledgeScanLoop(5000);
    // Calling again should be a no-op (guard)
    startKnowledgeScanLoop(5000);

    stopKnowledgeScanLoop();
    // Calling stop again should be safe
    stopKnowledgeScanLoop();
  });

  it("runs scan on interval and processes pages with sufficient content", async () => {
    // First query: recent pages
    dbMock._selectFromWhereLimitMock
      .mockResolvedValueOnce([{ id: "p1", title: "Page One", spaceId: "s1" }])
      // Second query: blocks for page p1
      .mockResolvedValueOnce([{ content: "A".repeat(110), type: "paragraph" }]);

    generateSuggestionsMock.mockResolvedValue(undefined);

    startKnowledgeScanLoop(1000);

    // Advance timer to trigger scan
    await vi.advanceTimersByTimeAsync(1000);

    expect(generateSuggestionsMock).toHaveBeenCalledTimes(1);
    expect(generateSuggestionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "periodic_scan",
        sourceId: "p1",
        targetSpaceId: "s1",
      })
    );

    stopKnowledgeScanLoop();
  });

  it("skips pages with insufficient content (< 100 chars)", async () => {
    dbMock._selectFromWhereLimitMock
      .mockResolvedValueOnce([{ id: "p1", title: "Short Page", spaceId: "s1" }])
      .mockResolvedValueOnce([{ content: "Short", type: "paragraph" }]);

    startKnowledgeScanLoop(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(generateSuggestionsMock).not.toHaveBeenCalled();

    stopKnowledgeScanLoop();
  });

  it("does nothing when no recent pages exist", async () => {
    dbMock._selectFromWhereLimitMock.mockResolvedValueOnce([]);

    startKnowledgeScanLoop(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(generateSuggestionsMock).not.toHaveBeenCalled();

    stopKnowledgeScanLoop();
  });

  it("handles scan errors gracefully without crashing", async () => {
    dbMock._selectFromWhereLimitMock.mockRejectedValueOnce(new Error("DB connection failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    startKnowledgeScanLoop(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[knowledge-scan] Scan failed:",
      expect.any(Error)
    );

    // Should be able to run again after error
    dbMock._selectFromWhereLimitMock.mockResolvedValueOnce([]);
    await vi.advanceTimersByTimeAsync(1000);

    stopKnowledgeScanLoop();
  });
});
