import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "../../db/schema.js";
import { writeAuditLog } from "../../lib/audit.js";
import { adminUser } from "../../test-utils/index.js";
import {
  ArticleCreationError,
  createWikiArticleFromMarkdown,
} from "./wiki-article-creation-service.js";

const { importPageWithBlocksMock, indexPageBackgroundMock, getSpaceByIdMock, canAccessSpaceMock } =
  vi.hoisted(() => ({
    importPageWithBlocksMock: vi.fn(),
    indexPageBackgroundMock: vi.fn(),
    getSpaceByIdMock: vi.fn(),
    canAccessSpaceMock: vi.fn(),
  }));

vi.mock("../../repositories/wiki/wiki-repository.js", () => ({
  importPageWithBlocks: importPageWithBlocksMock,
}));

vi.mock("./embedding-service.js", () => ({
  indexPageBackground: indexPageBackgroundMock,
}));

vi.mock("./space-service.js", () => ({
  GENERAL_SPACE_ID: "space_general",
  getSpaceById: getSpaceByIdMock,
  canAccessSpace: canAccessSpaceMock,
}));

vi.mock("../../lib/audit.js", () => ({
  writeAuditLog: vi.fn(async () => {}),
}));

function createdPage(overrides: Partial<Page> = {}): Page {
  return {
    id: "page_1",
    title: "New article",
    spaceId: "space_general",
    parentId: null,
    authorId: "admin_1",
    sortOrder: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Page;
}

describe("createWikiArticleFromMarkdown", () => {
  beforeEach(() => {
    importPageWithBlocksMock.mockReset();
    indexPageBackgroundMock.mockReset();
    getSpaceByIdMock.mockReset();
    canAccessSpaceMock.mockReset();
    vi.mocked(writeAuditLog).mockClear();

    getSpaceByIdMock.mockResolvedValue({ id: "space_general", type: "general" });
    canAccessSpaceMock.mockResolvedValue(true);
    importPageWithBlocksMock.mockImplementation(async (input: { title: string }) => ({
      page: createdPage({ title: input.title }),
      blocks: [],
    }));
  });

  it("creates a page attributed to the requesting user and indexes it", async () => {
    const page = await createWikiArticleFromMarkdown({
      user: adminUser(),
      title: "Shared notes",
      markdown: "# Shared notes\n\nSome content for the team.",
    });

    expect(page.title).toBe("Shared notes");
    expect(importPageWithBlocksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Shared notes",
        spaceId: "space_general",
        authorId: "admin_1",
        parentId: null,
      })
    );
    // Markdown is parsed into block drafts
    const call = importPageWithBlocksMock.mock.calls[0]?.[0] as
      | { blockDrafts: unknown[] }
      | undefined;
    expect(call?.blockDrafts?.length).toBeTruthy();
    expect(indexPageBackgroundMock).toHaveBeenCalledWith("page_1");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "wiki.page.create.agent",
        actorUserId: "admin_1",
        resourceId: "page_1",
      })
    );
  });

  it("rejects when the user cannot write to the space", async () => {
    canAccessSpaceMock.mockResolvedValue(false);

    await expect(
      createWikiArticleFromMarkdown({
        user: adminUser(),
        title: "Nope",
        markdown: "content",
      })
    ).rejects.toMatchObject({ code: "SPACE_FORBIDDEN" });
    expect(importPageWithBlocksMock).not.toHaveBeenCalled();
  });

  it("rejects unknown spaces", async () => {
    getSpaceByIdMock.mockResolvedValue(null);

    await expect(
      createWikiArticleFromMarkdown({
        user: adminUser(),
        title: "Nope",
        markdown: "content",
        spaceId: "space_missing",
      })
    ).rejects.toMatchObject({ code: "SPACE_NOT_FOUND" });
  });

  it("validates title and content", async () => {
    const user = adminUser();
    await expect(
      createWikiArticleFromMarkdown({ user, title: "  ", markdown: "content" })
    ).rejects.toBeInstanceOf(ArticleCreationError);
    await expect(
      createWikiArticleFromMarkdown({ user, title: "x".repeat(201), markdown: "content" })
    ).rejects.toMatchObject({ code: "INVALID_TITLE" });
    await expect(
      createWikiArticleFromMarkdown({ user, title: "ok", markdown: "   " })
    ).rejects.toMatchObject({ code: "INVALID_CONTENT" });
  });
});
