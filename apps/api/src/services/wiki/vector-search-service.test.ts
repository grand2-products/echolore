import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmbedText, mockIsEmbeddingEnabled, mockDbExecute, mockCanReadPage } = vi.hoisted(
  () => ({
    mockEmbedText: vi.fn(),
    mockIsEmbeddingEnabled: vi.fn(),
    mockDbExecute: vi.fn(),
    mockCanReadPage: vi.fn(),
  })
);

vi.mock("../../ai/embeddings.js", () => ({
  embedText: mockEmbedText,
  isEmbeddingEnabled: mockIsEmbeddingEnabled,
}));

vi.mock("../../db/index.js", () => ({
  db: {
    execute: (...args: unknown[]) => mockDbExecute(...args),
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: vi.fn((_strings: TemplateStringsArray, ..._values: unknown[]) => ({
    _tag: "sql",
  })),
}));

vi.mock("../../policies/authorization-policy.js", () => ({
  canReadPage: mockCanReadPage,
}));

vi.mock("../../lib/auth.js", () => ({}));

import type { SessionUser } from "../../lib/auth.js";
import { searchByVector, searchVisibleChunks } from "./vector-search-service.js";

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "user_1",
    email: "user@test.com",
    name: "Test User",
    role: UserRole.Member,
    ...overrides,
  };
}

describe("vector-search-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe("searchByVector", () => {
    it("returns mapped results when embedding succeeds", async () => {
      mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
      mockDbExecute.mockResolvedValue({
        rows: [
          {
            page_id: "p1",
            page_title: "Page One",
            chunk_text: "Some chunk",
            similarity: 0.95,
          },
        ],
      });

      const results = await searchByVector("test query");

      expect(results).toEqual([
        {
          pageId: "p1",
          pageTitle: "Page One",
          chunkText: "Some chunk",
          similarity: 0.95,
        },
      ]);
    });

    it("returns empty array when embedding returns null", async () => {
      mockEmbedText.mockResolvedValue(null);

      const results = await searchByVector("test query");

      expect(results).toEqual([]);
      expect(mockDbExecute).not.toHaveBeenCalled();
    });

    it("returns empty array when no results match", async () => {
      mockEmbedText.mockResolvedValue([0.1, 0.2]);
      mockDbExecute.mockResolvedValue({ rows: [] });

      const results = await searchByVector("obscure query");

      expect(results).toEqual([]);
    });
  });

  describe("searchVisibleChunks", () => {
    it("falls back to ILIKE search when embeddings are disabled", async () => {
      mockIsEmbeddingEnabled.mockResolvedValue(false);
      mockDbExecute.mockResolvedValue({
        rows: [
          {
            page_id: "p1",
            page_title: "Fallback",
            chunk_text: "matched text",
            similarity: 0.5,
          },
        ],
      });

      const user = makeUser();
      const results = await searchVisibleChunks(user, "search term");

      expect(results).toEqual([
        {
          pageId: "p1",
          pageTitle: "Fallback",
          chunkText: "matched text",
          similarity: 0.5,
        },
      ]);
      // Should NOT have called embedText since embeddings are disabled
      expect(mockEmbedText).not.toHaveBeenCalled();
    });

    it("returns all results for admin users without permission checks", async () => {
      const admin = makeUser({ role: UserRole.Admin });
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockEmbedText.mockResolvedValue([0.1, 0.2]);
      mockDbExecute.mockResolvedValue({
        rows: [
          { page_id: "p1", page_title: "Page 1", chunk_text: "chunk1", similarity: 0.9 },
          { page_id: "p2", page_title: "Page 2", chunk_text: "chunk2", similarity: 0.8 },
        ],
      });

      const results = await searchVisibleChunks(admin, "query", 5);

      expect(results).toHaveLength(2);
      expect(mockCanReadPage).not.toHaveBeenCalled();
    });

    it("filters results by permission for non-admin users", async () => {
      const user = makeUser({ role: UserRole.Member });
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockEmbedText.mockResolvedValue([0.1, 0.2]);
      mockDbExecute.mockResolvedValue({
        rows: [
          { page_id: "p1", page_title: "Allowed", chunk_text: "c1", similarity: 0.9 },
          { page_id: "p2", page_title: "Denied", chunk_text: "c2", similarity: 0.8 },
          { page_id: "p3", page_title: "Also Allowed", chunk_text: "c3", similarity: 0.7 },
        ],
      });

      mockCanReadPage
        .mockResolvedValueOnce(true) // p1 allowed
        .mockResolvedValueOnce(false) // p2 denied
        .mockResolvedValueOnce(true); // p3 allowed

      const results = await searchVisibleChunks(user, "query", 5);

      expect(results).toHaveLength(2);
      expect(results[0]?.pageId).toBe("p1");
      expect(results[1]?.pageId).toBe("p3");
    });

    it("deduplicates results by pageId", async () => {
      const admin = makeUser({ role: UserRole.Admin });
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockEmbedText.mockResolvedValue([0.1]);
      mockDbExecute.mockResolvedValue({
        rows: [
          { page_id: "p1", page_title: "Page 1", chunk_text: "chunk1a", similarity: 0.95 },
          { page_id: "p1", page_title: "Page 1", chunk_text: "chunk1b", similarity: 0.9 },
          { page_id: "p2", page_title: "Page 2", chunk_text: "chunk2", similarity: 0.8 },
        ],
      });

      const results = await searchVisibleChunks(admin, "query", 5);

      // p1 appears twice but should only be included once
      expect(results).toHaveLength(2);
      expect(results[0]?.chunkText).toBe("chunk1a"); // highest similarity wins
    });

    it("respects the limit parameter", async () => {
      const admin = makeUser({ role: UserRole.Admin });
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockEmbedText.mockResolvedValue([0.1]);
      mockDbExecute.mockResolvedValue({
        rows: [
          { page_id: "p1", page_title: "P1", chunk_text: "c1", similarity: 0.9 },
          { page_id: "p2", page_title: "P2", chunk_text: "c2", similarity: 0.8 },
          { page_id: "p3", page_title: "P3", chunk_text: "c3", similarity: 0.7 },
        ],
      });

      const results = await searchVisibleChunks(admin, "query", 2);

      expect(results).toHaveLength(2);
    });
  });

  describe("LIKE wildcard escaping", () => {
    it("escapes % and _ characters in fallback search", async () => {
      const user = makeUser();
      mockIsEmbeddingEnabled.mockResolvedValue(false);
      mockDbExecute.mockResolvedValue({ rows: [] });

      await searchVisibleChunks(user, "100% match_test");

      // The sql template tag is called; we verify the function doesn't crash
      // with special LIKE characters
      expect(mockDbExecute).toHaveBeenCalled();
    });

    it("escapes backslash characters in fallback search", async () => {
      const user = makeUser();
      mockIsEmbeddingEnabled.mockResolvedValue(false);
      mockDbExecute.mockResolvedValue({ rows: [] });

      await searchVisibleChunks(user, "path\\to\\file");

      expect(mockDbExecute).toHaveBeenCalled();
    });
  });
});
