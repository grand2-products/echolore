import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockIsEmbeddingEnabled,
  mockEmbedText,
  mockGetEmbeddingConfig,
  mockGetPageById,
  mockGetPageBlocks,
  mockDeletePageEmbeddingsByPageId,
  mockReplacePageEmbeddings,
} = vi.hoisted(() => ({
  mockIsEmbeddingEnabled: vi.fn(),
  mockEmbedText: vi.fn(),
  mockGetEmbeddingConfig: vi.fn(),
  mockGetPageById: vi.fn(),
  mockGetPageBlocks: vi.fn(),
  mockDeletePageEmbeddingsByPageId: vi.fn(),
  mockReplacePageEmbeddings: vi.fn(),
}));

vi.mock("../../ai/embeddings.js", () => ({
  isEmbeddingEnabled: mockIsEmbeddingEnabled,
  embedText: mockEmbedText,
  getEmbeddingConfig: mockGetEmbeddingConfig,
}));

vi.mock("../../repositories/wiki/wiki-repository.js", () => ({
  getPageById: mockGetPageById,
  getPageBlocks: mockGetPageBlocks,
  deletePageEmbeddingsByPageId: mockDeletePageEmbeddingsByPageId,
  replacePageEmbeddings: mockReplacePageEmbeddings,
  listNonDeletedPageIds: vi.fn(async () => []),
}));

vi.mock("../../lib/html-utils.js", () => ({
  stripHtml: vi.fn((html: string) => html.replace(/<[^>]*>/g, "")),
}));

import {
  chunkText,
  deletePageEmbeddings,
  extractPagePlainText,
  indexPage,
} from "./embedding-service.js";

describe("embedding-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockDeletePageEmbeddingsByPageId.mockResolvedValue(undefined);
    mockReplacePageEmbeddings.mockResolvedValue(undefined);
    mockGetEmbeddingConfig.mockResolvedValue({
      model: "gemini-embedding-2-preview",
      dimensions: 768,
    });
  });

  describe("chunkText", () => {
    it("returns single chunk when text is shorter than max", () => {
      const text = "Short text";
      const chunks = chunkText(text, 100, 20);

      expect(chunks).toEqual(["Short text"]);
    });

    it("splits long text into overlapping chunks", () => {
      const text = `${"A".repeat(100)}\n\n${"B".repeat(100)}`;
      const chunks = chunkText(text, 120, 20);

      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should be non-empty
      for (const chunk of chunks) {
        expect(chunk.length).toBeGreaterThan(0);
      }
    });

    it("tries to break at paragraph boundaries", () => {
      const paragraph1 = "First paragraph content here.";
      const paragraph2 = "Second paragraph content here.";
      const text = `${paragraph1}\n\n${paragraph2}`;
      // Set maxChars so text fits in 2 chunks with break at paragraph
      const chunks = chunkText(text, 40, 5);

      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it("handles empty string", () => {
      const chunks = chunkText("", 100, 20);

      // Empty string is <= maxChars, so it returns as a single-element array
      expect(chunks).toEqual([""]);
    });

    it("handles text exactly at max length", () => {
      const text = "X".repeat(100);
      const chunks = chunkText(text, 100, 20);

      expect(chunks).toEqual([text]);
    });

    it("always advances to prevent infinite loops", () => {
      // Text with no good break points
      const text = "A".repeat(500);
      const chunks = chunkText(text, 100, 20);

      expect(chunks.length).toBeGreaterThan(1);
      // Should terminate and cover all text
      const joined = chunks.join("");
      expect(joined.length).toBeGreaterThanOrEqual(text.length);
    });
  });

  describe("extractPagePlainText", () => {
    it("returns null when page does not exist", async () => {
      mockGetPageById.mockResolvedValue(null);

      const result = await extractPagePlainText("page_missing");

      expect(result).toBeNull();
    });

    it("returns null when page is deleted", async () => {
      mockGetPageById.mockResolvedValue({
        id: "page_1",
        title: "Deleted",
        deletedAt: new Date(),
      });

      const result = await extractPagePlainText("page_1");

      expect(result).toBeNull();
    });

    it("concatenates title and block content", async () => {
      mockGetPageById.mockResolvedValue({
        id: "page_1",
        title: "My Page",
        deletedAt: null,
      });
      mockGetPageBlocks.mockResolvedValue([
        { content: "<p>Hello</p>" },
        { content: "<b>World</b>" },
      ]);

      const result = await extractPagePlainText("page_1");

      expect(result).toContain("My Page");
      expect(result).toContain("Hello");
      expect(result).toContain("World");
    });

    it("returns null when page has no content", async () => {
      mockGetPageById.mockResolvedValue({
        id: "page_1",
        title: "",
        deletedAt: null,
      });
      mockGetPageBlocks.mockResolvedValue([]);

      const result = await extractPagePlainText("page_1");

      expect(result).toBeNull();
    });
  });

  describe("indexPage", () => {
    it("skips indexing when embeddings are disabled", async () => {
      mockIsEmbeddingEnabled.mockResolvedValue(false);

      await indexPage("page_1");

      expect(mockGetPageById).not.toHaveBeenCalled();
    });

    it("deletes embeddings when page has no text", async () => {
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockGetPageById.mockResolvedValue(null);

      await indexPage("page_missing");

      expect(mockDeletePageEmbeddingsByPageId).toHaveBeenCalledWith("page_missing");
    });

    it("generates and stores embeddings for page content", async () => {
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockGetPageById.mockResolvedValue({
        id: "page_1",
        title: "Test",
        deletedAt: null,
      });
      mockGetPageBlocks.mockResolvedValue([{ content: "Some content" }]);
      mockGetEmbeddingConfig.mockResolvedValue({ model: "text-embedding-004", dimensions: 768 });
      mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);

      await indexPage("page_1");

      expect(mockEmbedText).toHaveBeenCalled();
      expect(mockReplacePageEmbeddings).toHaveBeenCalled();
    });

    it("does not store when embedding API returns null", async () => {
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockGetPageById.mockResolvedValue({
        id: "page_1",
        title: "Test",
        deletedAt: null,
      });
      mockGetPageBlocks.mockResolvedValue([{ content: "Some content" }]);
      mockGetEmbeddingConfig.mockResolvedValue({ model: "text-embedding-004", dimensions: 768 });
      mockEmbedText.mockResolvedValue(null);

      await indexPage("page_1");

      expect(mockReplacePageEmbeddings).not.toHaveBeenCalled();
    });
  });

  describe("deletePageEmbeddings", () => {
    it("deletes embeddings for the given page", async () => {
      await deletePageEmbeddings("page_1");

      expect(mockDeletePageEmbeddingsByPageId).toHaveBeenCalledWith("page_1");
    });
  });
});
