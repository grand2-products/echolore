/**
 * AI Chat search pipeline E2E test.
 *
 * Verifies the full chain:
 *   indexPage() → page_embeddings stored → searchVisibleChunks() returns results
 *
 * Only the external embedding API is mocked; all internal wiring
 * (embedding-service → wiki-repository → vector-search-service) is exercised.
 */
import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — only the external boundaries
// ---------------------------------------------------------------------------

const FAKE_EMBEDDING = Array.from({ length: 8 }, (_, i) => (i + 1) * 0.1);

const {
  mockEmbedText,
  mockIsEmbeddingEnabled,
  mockGetEmbeddingConfig,
  mockGetPageById,
  mockGetPageBlocks,
  mockDeletePageEmbeddingsByPageId,
  mockReplacePageEmbeddings,
  mockSearchByVectorRepo,
  mockSearchByVectorForUser,
  mockFindPagesWithExplicitDeny,
  mockSearchPagesByIlike,
} = vi.hoisted(() => ({
  mockEmbedText: vi.fn(),
  mockIsEmbeddingEnabled: vi.fn(),
  mockGetEmbeddingConfig: vi.fn(),
  mockGetPageById: vi.fn(),
  mockGetPageBlocks: vi.fn(),
  mockDeletePageEmbeddingsByPageId: vi.fn(),
  mockReplacePageEmbeddings: vi.fn(),
  mockSearchByVectorRepo: vi.fn(),
  mockSearchByVectorForUser: vi.fn(),
  mockFindPagesWithExplicitDeny: vi.fn(),
  mockSearchPagesByIlike: vi.fn(),
}));

vi.mock("../../ai/embeddings.js", () => ({
  embedText: mockEmbedText,
  isEmbeddingEnabled: mockIsEmbeddingEnabled,
  getEmbeddingConfig: mockGetEmbeddingConfig,
}));

vi.mock("../../repositories/wiki/wiki-repository.js", () => ({
  getPageById: mockGetPageById,
  getPageBlocks: mockGetPageBlocks,
  deletePageEmbeddingsByPageId: mockDeletePageEmbeddingsByPageId,
  replacePageEmbeddings: mockReplacePageEmbeddings,
  searchByVector: mockSearchByVectorRepo,
  searchByVectorForUser: mockSearchByVectorForUser,
  findPagesWithExplicitDeny: mockFindPagesWithExplicitDeny,
  searchPagesByIlike: mockSearchPagesByIlike,
  listNonDeletedPageIds: vi.fn(async () => []),
}));

vi.mock("../../lib/html-utils.js", () => ({
  stripHtml: vi.fn((html: string) => html.replace(/<[^>]*>/g, "")),
}));

vi.mock("../../lib/auth.js", () => ({}));

import type { SessionUser } from "../../lib/auth.js";
import { indexPage } from "../wiki/embedding-service.js";
import { searchVisibleChunks } from "../wiki/vector-search-service.js";

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "user_1",
    email: "user@test.com",
    name: "Test User",
    role: UserRole.Member,
    ...overrides,
  };
}

describe("AI Chat search pipeline", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    mockIsEmbeddingEnabled.mockResolvedValue(true);
    mockGetEmbeddingConfig.mockResolvedValue({
      model: "gemini-embedding-2-preview",
      dimensions: 768,
    });
    mockEmbedText.mockResolvedValue(FAKE_EMBEDDING);
    mockDeletePageEmbeddingsByPageId.mockResolvedValue(undefined);
    mockReplacePageEmbeddings.mockResolvedValue(undefined);
    mockFindPagesWithExplicitDeny.mockResolvedValue(new Set());
  });

  it("indexPage generates embeddings and searchVisibleChunks finds them", async () => {
    // --- Step 1: Index a page ---
    mockGetPageById.mockResolvedValue({
      id: "page_1",
      title: "Company Handbook",
      deletedAt: null,
    });
    mockGetPageBlocks.mockResolvedValue([
      { content: "<p>Our company was founded in 2020.</p>" },
      { content: "<p>We build collaborative tools.</p>" },
    ]);

    await indexPage("page_1");

    // Verify embedding was generated
    expect(mockEmbedText).toHaveBeenCalled();
    const embedCall = mockEmbedText.mock.calls[0];
    expect(embedCall?.[0]).toContain("Company Handbook");
    expect(embedCall?.[1]).toEqual(expect.objectContaining({ taskType: "RETRIEVAL_DOCUMENT" }));

    // Verify embeddings were stored
    expect(mockReplacePageEmbeddings).toHaveBeenCalledWith(
      "page_1",
      expect.arrayContaining([
        expect.objectContaining({
          chunkIndex: 0,
          plainText: expect.stringContaining("Company Handbook"),
          embedding: FAKE_EMBEDDING,
          modelId: "gemini-embedding-2-preview",
        }),
      ])
    );

    // --- Step 2: Search should find the page ---
    mockSearchByVectorForUser.mockResolvedValue([
      {
        pageId: "page_1",
        pageTitle: "Company Handbook",
        chunkText: "Our company was founded in 2020.",
        similarity: 0.92,
      },
    ]);

    const user = makeUser();
    const { results, searchMode } = await searchVisibleChunks(
      user,
      "when was the company founded?"
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.pageId).toBe("page_1");
    expect(results[0]?.pageTitle).toBe("Company Handbook");
    expect(searchMode).toBe("vector");

    // Verify query used RETRIEVAL_QUERY task type
    const searchEmbedCall = mockEmbedText.mock.calls.at(-1);
    expect(searchEmbedCall?.[1]).toEqual(expect.objectContaining({ taskType: "RETRIEVAL_QUERY" }));
  });

  it("returns empty results when embedding is disabled", async () => {
    mockIsEmbeddingEnabled.mockResolvedValue(false);

    // indexPage should be a no-op
    await indexPage("page_1");
    expect(mockGetPageById).not.toHaveBeenCalled();
    expect(mockReplacePageEmbeddings).not.toHaveBeenCalled();

    // searchVisibleChunks should fall back to ILIKE
    mockSearchPagesByIlike.mockResolvedValue([]);
    const { results, searchMode } = await searchVisibleChunks(makeUser(), "test query");

    expect(results).toEqual([]);
    expect(searchMode).toBe("ilike_disabled");
    expect(mockSearchPagesByIlike).toHaveBeenCalled();
    expect(mockSearchByVectorForUser).not.toHaveBeenCalled();
  });

  it("returns empty results when embedding API returns null", async () => {
    // Index succeeds but generates no vectors
    mockGetPageById.mockResolvedValue({
      id: "page_1",
      title: "Test",
      deletedAt: null,
    });
    mockGetPageBlocks.mockResolvedValue([{ content: "content" }]);
    mockEmbedText.mockResolvedValue(null);

    await indexPage("page_1");
    expect(mockReplacePageEmbeddings).not.toHaveBeenCalled();

    // Search also gets null embedding
    const { results, searchMode } = await searchVisibleChunks(makeUser(), "query");
    expect(results).toEqual([]);
    expect(searchMode).toBe("empty_embedding");
  });

  it("page-level deny excludes results from search", async () => {
    mockSearchByVectorForUser.mockResolvedValue([
      { pageId: "page_1", pageTitle: "Public", chunkText: "c1", similarity: 0.9 },
      { pageId: "page_2", pageTitle: "Restricted", chunkText: "c2", similarity: 0.8 },
    ]);
    mockFindPagesWithExplicitDeny.mockResolvedValue(new Set(["page_2"]));

    const { results, searchMode } = await searchVisibleChunks(makeUser(), "query");

    expect(results).toHaveLength(1);
    expect(results[0]?.pageId).toBe("page_1");
    expect(searchMode).toBe("vector");
  });

  it("admin bypasses permission filter and uses unfiltered search", async () => {
    const admin = makeUser({ role: UserRole.Admin });
    mockSearchByVectorRepo.mockResolvedValue([
      { pageId: "page_1", pageTitle: "Secret", chunkText: "c1", similarity: 0.95 },
    ]);

    const { results, searchMode } = await searchVisibleChunks(admin, "query");

    expect(results).toHaveLength(1);
    expect(searchMode).toBe("vector");
    expect(mockSearchByVectorRepo).toHaveBeenCalled();
    expect(mockSearchByVectorForUser).not.toHaveBeenCalled();
    expect(mockFindPagesWithExplicitDeny).not.toHaveBeenCalled();
  });

  it("falls back to ILIKE when vector search throws", async () => {
    mockSearchByVectorForUser.mockRejectedValue(new Error("dimension mismatch"));
    mockSearchPagesByIlike.mockResolvedValue([
      { pageId: "page_1", pageTitle: "Fallback", chunkText: "keyword hit", similarity: 0.5 },
    ]);

    const { results, searchMode } = await searchVisibleChunks(makeUser(), "query");

    expect(results).toHaveLength(1);
    expect(results[0]?.pageTitle).toBe("Fallback");
    expect(searchMode).toBe("ilike_fallback");
  });
});
