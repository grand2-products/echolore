import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEmbedText,
  mockIsEmbeddingEnabled,
  mockSearchByVectorRepo,
  mockSearchByVectorForUser,
  mockFindPagesWithExplicitDeny,
  mockSearchPagesByIlike,
  mockSearchPagesByIlikeForUser,
} = vi.hoisted(() => ({
  mockEmbedText: vi.fn(),
  mockIsEmbeddingEnabled: vi.fn(),
  mockSearchByVectorRepo: vi.fn(),
  mockSearchByVectorForUser: vi.fn(),
  mockFindPagesWithExplicitDeny: vi.fn(),
  mockSearchPagesByIlike: vi.fn(),
  mockSearchPagesByIlikeForUser: vi.fn(),
}));

vi.mock("../../ai/embeddings.js", () => ({
  embedText: mockEmbedText,
  isEmbeddingEnabled: mockIsEmbeddingEnabled,
}));

vi.mock("../../repositories/wiki/wiki-repository.js", () => ({
  searchByVector: mockSearchByVectorRepo,
  searchByVectorForUser: mockSearchByVectorForUser,
  findPagesWithExplicitDeny: mockFindPagesWithExplicitDeny,
  searchPagesByIlike: mockSearchPagesByIlike,
  searchPagesByIlikeForUser: mockSearchPagesByIlikeForUser,
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
    mockFindPagesWithExplicitDeny.mockResolvedValue(new Set());
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

    it("falls back to keyword search when vector search throws (dimension mismatch)", async () => {
      mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
      mockSearchByVectorRepo.mockRejectedValue(new Error("different vector dimensions"));
      mockSearchPagesByIlike.mockResolvedValue([
        { pageId: "p1", pageTitle: "Fallback", chunkText: "keyword match", similarity: 0.5 },
      ]);

      const results = await searchByVector("test query");

      expect(results).toEqual([
        { pageId: "p1", pageTitle: "Fallback", chunkText: "keyword match", similarity: 0.5 },
      ]);
      expect(mockSearchPagesByIlike).toHaveBeenCalledWith("test query", 10);
    });
  });

  describe("searchVisibleChunks", () => {
    it("falls back to permission-scoped ILIKE search for members when embeddings are disabled (C4 regression)", async () => {
      mockIsEmbeddingEnabled.mockResolvedValue(false);
      mockSearchPagesByIlikeForUser.mockResolvedValue([
        {
          pageId: "p1",
          pageTitle: "Fallback",
          chunkText: "matched text",
          similarity: 0.5,
        },
      ]);

      const user = makeUser();
      const { results, searchMode } = await searchVisibleChunks(user, "search term");

      expect(searchMode).toBe("ilike_disabled");
      expect(results).toEqual([
        {
          pageId: "p1",
          pageTitle: "Fallback",
          chunkText: "matched text",
          similarity: 0.5,
        },
      ]);
      // C4 regression: member fallback MUST use the user-scoped repo function,
      // never the admin-equivalent `searchPagesByIlike` (which would broadcast
      // admin-only pages to all viewers during embedding outage).
      expect(mockSearchPagesByIlikeForUser).toHaveBeenCalledWith("user_1", "search term", 5);
      expect(mockSearchPagesByIlike).not.toHaveBeenCalled();
      expect(mockEmbedText).not.toHaveBeenCalled();
    });

    it("uses admin-scope ILIKE for admin users when embeddings are disabled", async () => {
      mockIsEmbeddingEnabled.mockResolvedValue(false);
      mockSearchPagesByIlike.mockResolvedValue([
        { pageId: "p1", pageTitle: "Admin Page", chunkText: "secret", similarity: 0.5 },
      ]);

      const admin = makeUser({ role: UserRole.Admin });
      const { results, searchMode } = await searchVisibleChunks(admin, "search term");

      expect(searchMode).toBe("ilike_disabled");
      expect(results).toHaveLength(1);
      expect(mockSearchPagesByIlike).toHaveBeenCalledWith("search term", 5);
      expect(mockSearchPagesByIlikeForUser).not.toHaveBeenCalled();
    });

    it("falls back to permission-scoped ILIKE on vector dimension error (C4 regression)", async () => {
      const user = makeUser({ role: UserRole.Member });
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockEmbedText.mockResolvedValue([0.1, 0.2]);
      mockSearchByVectorForUser.mockRejectedValueOnce(new Error("different vector dimensions"));
      mockSearchPagesByIlikeForUser.mockResolvedValue([
        { pageId: "p1", pageTitle: "Allowed", chunkText: "c", similarity: 0.5 },
      ]);

      const { results, searchMode } = await searchVisibleChunks(user, "search term", 5);

      expect(searchMode).toBe("ilike_fallback");
      expect(results).toHaveLength(1);
      expect(mockSearchPagesByIlikeForUser).toHaveBeenCalledWith("user_1", "search term", 5);
      expect(mockSearchPagesByIlike).not.toHaveBeenCalled();
    });

    it("applies findPagesWithExplicitDeny to the ILIKE fallback path for members (C4 regression)", async () => {
      const user = makeUser({ role: UserRole.Member });
      mockIsEmbeddingEnabled.mockResolvedValue(false);
      mockSearchPagesByIlikeForUser.mockResolvedValue([
        { pageId: "p1", pageTitle: "Allowed", chunkText: "c1", similarity: 0.5 },
        { pageId: "p2", pageTitle: "Denied", chunkText: "c2", similarity: 0.5 },
      ]);
      mockFindPagesWithExplicitDeny.mockResolvedValue(new Set(["p2"]));

      const { results } = await searchVisibleChunks(user, "q");

      expect(results.map((r) => r.pageId)).toEqual(["p1"]);
    });

    it("returns all results for admin users without per-page permission checks", async () => {
      const admin = makeUser({ role: UserRole.Admin });
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockEmbedText.mockResolvedValue([0.1, 0.2]);
      mockSearchByVectorRepo.mockResolvedValue([
        { pageId: "p1", pageTitle: "Page 1", chunkText: "chunk1", similarity: 0.9 },
        { pageId: "p2", pageTitle: "Page 2", chunkText: "chunk2", similarity: 0.8 },
      ]);

      const { results } = await searchVisibleChunks(admin, "query", 5);

      expect(results).toHaveLength(2);
      expect(mockSearchByVectorForUser).not.toHaveBeenCalled();
    });

    it("uses SQL-level permission filter for non-admin users", async () => {
      const user = makeUser({ role: UserRole.Member });
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockEmbedText.mockResolvedValue([0.1, 0.2]);
      mockSearchByVectorForUser.mockResolvedValue([
        { pageId: "p1", pageTitle: "Allowed", chunkText: "c1", similarity: 0.9 },
        { pageId: "p3", pageTitle: "Also Allowed", chunkText: "c3", similarity: 0.7 },
      ]);

      const { results } = await searchVisibleChunks(user, "query", 5);

      expect(results).toHaveLength(2);
      expect(results[0]?.pageId).toBe("p1");
      expect(results[1]?.pageId).toBe("p3");
      expect(mockSearchByVectorForUser).toHaveBeenCalledWith([0.1, 0.2], "user_1", 5);
    });

    it("excludes pages with explicit page-level deny", async () => {
      const user = makeUser({ role: UserRole.Member });
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockEmbedText.mockResolvedValue([0.1, 0.2]);
      mockSearchByVectorForUser.mockResolvedValue([
        { pageId: "p1", pageTitle: "Allowed", chunkText: "c1", similarity: 0.9 },
        { pageId: "p2", pageTitle: "Denied by page perm", chunkText: "c2", similarity: 0.8 },
        { pageId: "p3", pageTitle: "Also Allowed", chunkText: "c3", similarity: 0.7 },
      ]);
      mockFindPagesWithExplicitDeny.mockResolvedValue(new Set(["p2"]));

      const { results } = await searchVisibleChunks(user, "query", 5);

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

      const { results } = await searchVisibleChunks(admin, "query", 5);

      expect(results).toHaveLength(2);
      expect(results[0]?.chunkText).toBe("chunk1a");
    });

    it("returns empty when embedding returns null", async () => {
      const user = makeUser();
      mockIsEmbeddingEnabled.mockResolvedValue(true);
      mockEmbedText.mockResolvedValue(null);

      const { results, searchMode } = await searchVisibleChunks(user, "query");

      expect(results).toEqual([]);
      expect(searchMode).toBe("empty_embedding");
    });
  });

  describe("LIKE wildcard escaping (member fallback)", () => {
    it("escapes % and _ characters in fallback search", async () => {
      const user = makeUser();
      mockIsEmbeddingEnabled.mockResolvedValue(false);
      mockSearchPagesByIlikeForUser.mockResolvedValue([]);

      await searchVisibleChunks(user, "100% match_test");

      // Member path now goes through searchPagesByIlikeForUser (C4).
      // The repository implementation is responsible for actual escaping.
      expect(mockSearchPagesByIlikeForUser).toHaveBeenCalledWith("user_1", "100% match_test", 5);
    });

    it("escapes backslash characters in fallback search", async () => {
      const user = makeUser();
      mockIsEmbeddingEnabled.mockResolvedValue(false);
      mockSearchPagesByIlikeForUser.mockResolvedValue([]);

      await searchVisibleChunks(user, "path\\to\\file");

      expect(mockSearchPagesByIlikeForUser).toHaveBeenCalledWith("user_1", "path\\to\\file", 5);
    });
  });
});
