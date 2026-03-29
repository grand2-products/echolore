import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listRecentUpdatedPagesMock, listPageBlockContentsMock, generateSuggestionsMock } =
  vi.hoisted(() => ({
    listRecentUpdatedPagesMock: vi.fn(),
    listPageBlockContentsMock: vi.fn(),
    generateSuggestionsMock: vi.fn(),
  }));

vi.mock("../../repositories/wiki/wiki-repository.js", () => ({
  listRecentUpdatedPages: listRecentUpdatedPagesMock,
  listPageBlockContents: listPageBlockContentsMock,
}));

vi.mock("./knowledge-suggestion-service.js", () => ({
  generateSuggestions: generateSuggestionsMock,
}));

import { startKnowledgeScanLoop, stopKnowledgeScanLoop } from "./knowledge-scan-service.js";

describe("knowledge-scan-service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generateSuggestionsMock.mockReset();
    listRecentUpdatedPagesMock.mockReset();
    listPageBlockContentsMock.mockReset();
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
    listRecentUpdatedPagesMock.mockResolvedValueOnce([
      { id: "p1", title: "Page One", space_id: "s1" },
    ]);
    listPageBlockContentsMock.mockResolvedValueOnce([
      { content: "A".repeat(110), type: "paragraph" },
    ]);

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
    listRecentUpdatedPagesMock.mockResolvedValueOnce([
      { id: "p1", title: "Short Page", space_id: "s1" },
    ]);
    listPageBlockContentsMock.mockResolvedValueOnce([{ content: "Short", type: "paragraph" }]);

    startKnowledgeScanLoop(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(generateSuggestionsMock).not.toHaveBeenCalled();

    stopKnowledgeScanLoop();
  });

  it("does nothing when no recent pages exist", async () => {
    listRecentUpdatedPagesMock.mockResolvedValueOnce([]);

    startKnowledgeScanLoop(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(generateSuggestionsMock).not.toHaveBeenCalled();

    stopKnowledgeScanLoop();
  });

  it("handles scan errors gracefully without crashing", async () => {
    listRecentUpdatedPagesMock.mockRejectedValueOnce(new Error("DB connection failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    startKnowledgeScanLoop(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[knowledge-scan] Scan failed:",
      expect.any(Error)
    );

    // Should be able to run again after error
    listRecentUpdatedPagesMock.mockResolvedValueOnce([]);
    await vi.advanceTimersByTimeAsync(1000);

    stopKnowledgeScanLoop();
  });
});
