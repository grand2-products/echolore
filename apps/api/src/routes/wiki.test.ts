import { UserRole } from "@echolore/shared/contracts";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv, SessionUser } from "../lib/auth.js";
import { wikiRoutes } from "./wiki/index.js";

const {
  authorizePageResourceMock,
  createBlockMock,
  deleteBlockMock,
  deletePageMock,
  createPageWithAccessDefaultsMock,
  detectPageCycleMock,
  getFileByIdMock,
  getBlockByIdMock,
  getPageBlocksMock,
  loadFileMock,
  getPageByIdMock,
  listVisiblePagesMock,
  searchVisiblePagesMock,
  updateBlockMock,
  updatePageMock,
  writeAuditLogMock,
  canAccessSpaceMock,
  getOrCreatePersonalSpaceMock,
  listVisibleSpacesMock,
  getSpaceByIdMock,
} = vi.hoisted(() => ({
  authorizePageResourceMock: vi.fn(),
  createBlockMock: vi.fn(),
  createPageWithAccessDefaultsMock: vi.fn(),
  deleteBlockMock: vi.fn(),
  deletePageMock: vi.fn(),
  detectPageCycleMock: vi.fn(),
  getFileByIdMock: vi.fn(),
  getBlockByIdMock: vi.fn(),
  getPageBlocksMock: vi.fn(),
  loadFileMock: vi.fn(),
  getPageByIdMock: vi.fn(),
  listVisiblePagesMock: vi.fn(),
  searchVisiblePagesMock: vi.fn(),
  updateBlockMock: vi.fn(),
  updatePageMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  canAccessSpaceMock: vi.fn(),
  getOrCreatePersonalSpaceMock: vi.fn(),
  listVisibleSpacesMock: vi.fn(),
  getSpaceByIdMock: vi.fn(),
}));

vi.mock("../lib/file-storage.js", () => ({
  loadFile: loadFileMock,
  saveFile: vi.fn(),
  removeFile: vi.fn(),
  buildStoragePath: vi.fn((p: string) => p),
}));

vi.mock("../policies/authorization-policy.js", () => ({
  authorizePageResource: authorizePageResourceMock,
}));

vi.mock("../services/wiki/wiki-service.js", () => ({
  createBlock: createBlockMock,
  deleteBlock: deleteBlockMock,
  deletePage: deletePageMock,
  getBlockById: getBlockByIdMock,
  getPageBlocks: getPageBlocksMock,
  getPageById: getPageByIdMock,
  updateBlock: updateBlockMock,
  updatePage: updatePageMock,
  createPageWithAccessDefaults: createPageWithAccessDefaultsMock,
  detectPageCycle: detectPageCycleMock,
  listVisiblePages: listVisiblePagesMock,
  searchVisiblePages: searchVisiblePagesMock,
}));

vi.mock("../services/file/file-service.js", () => ({
  getFileById: getFileByIdMock,
}));

vi.mock("../services/admin/admin-service.js", () => ({
  deletePagePermission: vi.fn(),
  getPageInheritance: vi.fn(),
  getPagePermissionsDetail: vi.fn(),
  listGroupsWithMemberCounts: vi.fn().mockResolvedValue([]),
  replacePageInheritance: vi.fn(),
  replacePagePermissions: vi.fn(),
}));

vi.mock("../lib/audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
  auditAction: vi.fn(),
  extractRequestMeta: vi.fn(() => ({ ipAddress: null, userAgent: null })),
}));

vi.mock("../services/wiki/space-service.js", () => ({
  GENERAL_SPACE_ID: "00000000-0000-0000-0000-000000000001",
  canAccessSpace: canAccessSpaceMock,
  getOrCreatePersonalSpace: getOrCreatePersonalSpaceMock,
  getSpaceById: getSpaceByIdMock,
  listVisibleSpaces: listVisibleSpacesMock,
}));

function createApp(sessionUser: SessionUser) {
  const app = new Hono<AppEnv>();

  app.use("/api/*", async (c, next) => {
    c.set("user", sessionUser);
    await next();
  });

  app.route("/api/wiki", wikiRoutes);
  return app;
}

describe("wikiRoutes", () => {
  beforeEach(() => {
    authorizePageResourceMock.mockReset();
    createBlockMock.mockReset();
    createPageWithAccessDefaultsMock.mockReset();
    deleteBlockMock.mockReset();
    deletePageMock.mockReset();
    detectPageCycleMock.mockReset();
    getFileByIdMock.mockReset();
    getBlockByIdMock.mockReset();
    getPageBlocksMock.mockReset();
    loadFileMock.mockReset();
    getPageByIdMock.mockReset();
    listVisiblePagesMock.mockReset();
    searchVisiblePagesMock.mockReset();
    updateBlockMock.mockReset();
    updatePageMock.mockReset();
    writeAuditLogMock.mockReset();
    canAccessSpaceMock.mockReset();
    getOrCreatePersonalSpaceMock.mockReset();
    listVisibleSpacesMock.mockReset();
    getSpaceByIdMock.mockReset();
  });

  it("returns page detail with blocks for authorized users", async () => {
    const app = createApp({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
      role: UserRole.Member,
    });

    getPageByIdMock.mockResolvedValue({
      id: "page_1",
      title: "Home",
      parentId: null,
      authorId: "user_1",
      createdAt: new Date("2026-03-11T09:00:00.000Z"),
      updatedAt: new Date("2026-03-11T09:05:00.000Z"),
    });
    authorizePageResourceMock.mockResolvedValue({ allowed: true, reason: "owner" });
    getPageBlocksMock.mockResolvedValue([
      {
        id: "block_1",
        pageId: "page_1",
        type: "text",
        content: "Hello",
        properties: null,
        sortOrder: 0,
        createdAt: new Date("2026-03-11T09:01:00.000Z"),
        updatedAt: new Date("2026-03-11T09:01:00.000Z"),
      },
    ]);

    const response = await app.request("http://localhost/api/wiki/page_1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      page: {
        id: "page_1",
        title: "Home",
        parentId: null,
        authorId: "user_1",
        createdAt: "2026-03-11T09:00:00.000Z",
        updatedAt: "2026-03-11T09:05:00.000Z",
      },
      blocks: [
        {
          id: "block_1",
          pageId: "page_1",
          type: "text",
          content: "Hello",
          properties: null,
          sortOrder: 0,
          createdAt: "2026-03-11T09:01:00.000Z",
          updatedAt: "2026-03-11T09:01:00.000Z",
        },
      ],
    });
  });

  it("rejects page detail access when authorization denies the request", async () => {
    const app = createApp({
      id: "user_2",
      email: "member@example.com",
      name: "Member",
      role: UserRole.Member,
    });

    getPageByIdMock.mockResolvedValue({
      id: "page_1",
      title: "Home",
      parentId: null,
      authorId: "user_1",
      createdAt: new Date("2026-03-11T09:00:00.000Z"),
      updatedAt: new Date("2026-03-11T09:05:00.000Z"),
    });
    authorizePageResourceMock.mockResolvedValue({
      allowed: false,
      reason: "missing-page-permission",
    });

    const response = await app.request("http://localhost/api/wiki/page_1");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "WIKI_PAGE_FORBIDDEN",
      error: "Forbidden",
    });
    expect(getPageBlocksMock).not.toHaveBeenCalled();
  });

  it("ignores client-supplied authorId and uses the session user for page creation", async () => {
    const app = createApp({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
      role: UserRole.Member,
    });

    getSpaceByIdMock.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000001",
      name: "General",
      type: "general",
      ownerUserId: null,
      groupId: null,
    });
    canAccessSpaceMock.mockResolvedValue(true);
    createPageWithAccessDefaultsMock.mockImplementation(async (input) => ({
      ...input,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    }));

    const response = await app.request("http://localhost/api/wiki", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Home",
        authorId: "spoofed_user",
      }),
    });

    expect(response.status).toBe(201);
    expect(createPageWithAccessDefaultsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: "user_1",
        title: "Home",
      })
    );
    expect(createPageWithAccessDefaultsMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: "spoofed_user",
      })
    );
  });

  it("resolves a wiki attachment download for authorized page readers", async () => {
    const app = createApp({
      id: "user_2",
      email: "member@example.com",
      name: "Member",
      role: UserRole.Member,
    });

    getPageByIdMock.mockResolvedValue({
      id: "page_1",
      title: "Home",
      parentId: null,
      authorId: "user_1",
      createdAt: new Date("2026-03-11T09:00:00.000Z"),
      updatedAt: new Date("2026-03-11T09:05:00.000Z"),
    });
    authorizePageResourceMock.mockResolvedValue({ allowed: true, reason: "group:engineering" });
    getFileByIdMock.mockResolvedValue({
      id: "file_1",
      filename: "design.pdf",
      contentType: "application/pdf",
      size: 1234,
      storagePath: "uploads/file_1-design.pdf",
      uploaderId: "user_1",
      createdAt: new Date("2026-03-11T09:01:00.000Z"),
    });
    loadFileMock.mockResolvedValue(Buffer.from("pdf-content"));

    const response = await app.request("http://localhost/api/wiki/page_1/files/file_1/download");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  it("returns 404 when the file record does not exist", async () => {
    const app = createApp({
      id: "user_2",
      email: "member@example.com",
      name: "Member",
      role: UserRole.Member,
    });

    getPageByIdMock.mockResolvedValue({
      id: "page_1",
      title: "Home",
      parentId: null,
      authorId: "user_1",
      createdAt: new Date("2026-03-11T09:00:00.000Z"),
      updatedAt: new Date("2026-03-11T09:05:00.000Z"),
    });
    authorizePageResourceMock.mockResolvedValue({ allowed: true, reason: "group:engineering" });
    getFileByIdMock.mockResolvedValue(null);

    const response = await app.request("http://localhost/api/wiki/page_1/files/file_1/download");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      code: "WIKI_FILE_NOT_FOUND",
      error: "File not found",
    });
  });
});
