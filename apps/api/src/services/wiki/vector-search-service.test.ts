import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEmbedText,
  mockIsEmbeddingEnabled,
  mockSearchByVectorRepo,
  mockSearchPagesByIlike,
  mockCanReadPage,
} = vi.hoisted(() => ({
  mockEmbedText: vi.fn(),
  mockIsEmbeddingEnabled: vi.fn(),
  mockSearchByVectorRepo: vi.fn(),
  mockSearchPagesByIlike: vi.fn(),
  mockCanReadPage: vi.fn(),
}));

vi.mock("../../ai/embeddings.js", () => ({
  embedText: mockEmbedText,
  isEmbeddingEnabled: mockIsEmbeddingEnabled,
}));

vi.mock("../../repositories/wiki/wiki-repository.js", () => ({
  searchByVector: mockSearchByVectorRepo,
  searchPagesByIlike: mockSearchPagesByIlike,
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
      mockSearchByVectorRepo.mockResolvedValue([
        {
          pageId: "p1",
          pageTitle: "Page One",
          chunkText: "Some chunk",
          similarity: 0.95,
        },
      ]);

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
      expect(mockSearchByVectorRepo).not.toHaveBeenCalled();
    });

    it("returns empty array when no results match", async () => {
      mockEmbedText.mockResolvedValue([0.1, 0.2]);
      mockSearchByVectorRepo.mockResolvedValue([]);

      const results = await searchByVector("obscure query");

      expect(results).toEqual([]);
    });
  });

  describe("searchVisibleChunks", () => {
    it("falls back to ILIKE search when embeddings are disabled", async () => {
      mockIsEmbeddingEnabled.mockResolvedValue(false);
      mockSearchPagesByIlike.mockResolvedValue([
        {
          pageId: "p1",
          pageTitle: "Fallback",
          chunkText: "matched text",
          similarity: 0.5,
        },
      ]);

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
      mockSearchByVectorRepo.mockResolvedValue([
        { pageId: "p1", pageTitle: "Page 1", chunkText: "chunk1", similarity: 0.9 },
        { pageId: "p2", pageTitle: "Page 2", chunkText: "chunk2", similarity: 0.8 },
      ]);

      const results = await searchVisibleChunks(admin, "query", 5);

      expect(results).toHaveLength(2);
      expect(mockCanReadPage).not.toHaveBeenCalled();
    });

    it("filters results by permission for non-admin users", async () => {
      const user = makeUser({ role: UserRole.Member });
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockEmbedText.mockResolvedValue([0.1, 0.2]);
      mockSearchByVectorRepo.mockResolvedValue([
        { pageId: "p1", pageTitle: "Allowed", chunkText: "c1", similarity: 0.9 },
        { pageId: "p2", pageTitle: "Denied", chunkText: "c2", similarity: 0.8 },
        { pageId: "p3", pageTitle: "Also Allowed", chunkText: "c3", similarity: 0.7 },
      ]);

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
      mockSearchByVectorRepo.mockResolvedValue([
        { pageId: "p1", pageTitle: "Page 1", chunkText: "chunk1a", similarity: 0.95 },
        { pageId: "p1", pageTitle: "Page 1", chunkText: "chunk1b", similarity: 0.9 },
        { pageId: "p2", pageTitle: "Page 2", chunkText: "chunk2", similarity: 0.8 },
      ]);

      const results = await searchVisibleChunks(admin, "query", 5);

      // p1 appears twice but should only be included once
      expect(results).toHaveLength(2);
      expect(results[0]?.chunkText).toBe("chunk1a"); // highest similarity wins
    });

    it("respects the limit parameter", async () => {
      const admin = makeUser({ role: UserRole.Admin });
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockEmbedText.mockResolvedValue([0.1]);
      mockSearchByVectorRepo.mockResolvedValue([
        { pageId: "p1", pageTitle: "P1", chunkText: "c1", similarity: 0.9 },
        { pageId: "p2", pageTitle: "P2", chunkText: "c2", similarity: 0.8 },
        { pageId: "p3", pageTitle: "P3", chunkText: "c3", similarity: 0.7 },
      ]);

      const results = await searchVisibleChunks(admin, "query", 2);

      expect(results).toHaveLength(2);
    });
  });

  describe("LIKE wildcard escaping", () => {
    it("escapes % and _ characters in fallback search", async () => {
      const user = makeUser();
      mockIsEmbeddingEnabled.mockResolvedValue(false);
      mockSearchPagesByIlike.mockResolvedValue([]);

      await searchVisibleChunks(user, "100% match_test");

      // Verify the function doesn't crash with special LIKE characters
      expect(mockSearchPagesByIlike).toHaveBeenCalled();
    });

    it("escapes backslash characters in fallback search", async () => {
      const user = makeUser();
      mockIsEmbeddingEnabled.mockResolvedValue(false);
      mockSearchPagesByIlike.mockResolvedValue([]);

      await searchVisibleChunks(user, "path\\to\\file");

      expect(mockSearchPagesByIlike).toHaveBeenCalled();
    });
  });
});
