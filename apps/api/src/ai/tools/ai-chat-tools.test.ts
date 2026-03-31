import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListRecentVisiblePagesForUser,
  mockListRecentPagesAdmin,
  mockListFirstSnippetsByPageIds,
  mockFindPagesWithExplicitDeny,
} = vi.hoisted(() => ({
  mockListRecentVisiblePagesForUser: vi.fn(),
  mockListRecentPagesAdmin: vi.fn(),
  mockListFirstSnippetsByPageIds: vi.fn(),
  mockFindPagesWithExplicitDeny: vi.fn(),
}));

vi.mock("../../repositories/wiki/wiki-repository.js", () => ({
  listRecentVisiblePagesForUser: mockListRecentVisiblePagesForUser,
  listRecentPagesAdmin: mockListRecentPagesAdmin,
  listFirstSnippetsByPageIds: mockListFirstSnippetsByPageIds,
  findPagesWithExplicitDeny: mockFindPagesWithExplicitDeny,
  getPageBlocks: vi.fn(),
  getPageById: vi.fn(),
}));

vi.mock("../../services/wiki/vector-search-service.js", () => ({
  searchByVector: vi.fn(),
}));

vi.mock("../../policies/authorization-policy.js", () => ({
  canReadPage: vi.fn(),
}));

vi.mock("../../lib/html-utils.js", () => ({
  stripHtml: (html: string) => html.replace(/<[^>]+>/g, ""),
}));

import type { SessionUser } from "../../lib/auth.js";
import { createAiChatListPagesTool } from "./ai-chat-tools.js";

const memberUser: SessionUser = {
  id: "user-1",
  email: "member@test.com",
  name: "Member",
  role: UserRole.Member,
};

const adminUser: SessionUser = {
  id: "admin-1",
  email: "admin@test.com",
  name: "Admin",
  role: UserRole.Admin,
};

describe("createAiChatListPagesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pages with snippets for a member user", async () => {
    mockListRecentVisiblePagesForUser.mockResolvedValue([
      { pageId: "p1", pageTitle: "Page One", updatedAt: new Date("2026-01-15") },
      { pageId: "p2", pageTitle: "Page Two", updatedAt: new Date("2026-01-10") },
    ]);
    mockFindPagesWithExplicitDeny.mockResolvedValue(new Set());
    mockListFirstSnippetsByPageIds.mockResolvedValue([
      { pageId: "p1", snippet: "Hello world" },
      { pageId: "p2", snippet: "<b>Bold text</b>" },
    ]);

    const { listPagesTool, referencedPages } = createAiChatListPagesTool(memberUser);
    const result = await listPagesTool.invoke({ limit: 10 });

    expect(mockListRecentVisiblePagesForUser).toHaveBeenCalledWith("user-1", 15);
    expect(result).toContain("Page One");
    expect(result).toContain("Page Two");
    expect(result).toContain("Hello world");
    expect(result).toContain("Bold text");
    expect(result).not.toContain("<b>");
    // Discovery tool should NOT track citations
    expect(referencedPages).toHaveLength(0);
  });

  it("uses admin query for admin users and skips deny filter", async () => {
    mockListRecentPagesAdmin.mockResolvedValue([
      { pageId: "p1", pageTitle: "Admin Page", updatedAt: new Date("2026-03-01") },
    ]);
    mockListFirstSnippetsByPageIds.mockResolvedValue([]);

    const { listPagesTool } = createAiChatListPagesTool(adminUser);
    await listPagesTool.invoke({ limit: 5 });

    expect(mockListRecentPagesAdmin).toHaveBeenCalledWith(10);
    expect(mockListRecentVisiblePagesForUser).not.toHaveBeenCalled();
    expect(mockFindPagesWithExplicitDeny).not.toHaveBeenCalled();
  });

  it("excludes pages with explicit deny", async () => {
    mockListRecentVisiblePagesForUser.mockResolvedValue([
      { pageId: "p1", pageTitle: "Allowed", updatedAt: new Date("2026-01-15") },
      { pageId: "p2", pageTitle: "Denied", updatedAt: new Date("2026-01-10") },
    ]);
    mockFindPagesWithExplicitDeny.mockResolvedValue(new Set(["p2"]));
    mockListFirstSnippetsByPageIds.mockResolvedValue([
      { pageId: "p1", snippet: "allowed content" },
    ]);

    const { listPagesTool } = createAiChatListPagesTool(memberUser);
    const result = await listPagesTool.invoke({ limit: 10 });

    expect(result).toContain("Allowed");
    expect(result).not.toContain("Denied");
  });

  it("returns empty message when no pages available", async () => {
    mockListRecentVisiblePagesForUser.mockResolvedValue([]);
    mockFindPagesWithExplicitDeny.mockResolvedValue(new Set());

    const { listPagesTool } = createAiChatListPagesTool(memberUser);
    const result = await listPagesTool.invoke({ limit: 5 });

    expect(result).toBe("No wiki pages are available.");
  });

  it("respects limit after deny filtering", async () => {
    const pages = Array.from({ length: 8 }, (_, i) => ({
      pageId: `p${i}`,
      pageTitle: `Page ${i}`,
      updatedAt: new Date(`2026-01-${15 - i}`),
    }));
    mockListRecentVisiblePagesForUser.mockResolvedValue(pages);
    mockFindPagesWithExplicitDeny.mockResolvedValue(new Set(["p0", "p1"]));
    mockListFirstSnippetsByPageIds.mockResolvedValue([]);

    const { listPagesTool } = createAiChatListPagesTool(memberUser);
    const result = await listPagesTool.invoke({ limit: 3 });

    // p0 and p1 denied, so should get p2, p3, p4
    expect(result).toContain("Page 2");
    expect(result).toContain("Page 3");
    expect(result).toContain("Page 4");
    expect(result).not.toContain("Page 5");
  });
});
