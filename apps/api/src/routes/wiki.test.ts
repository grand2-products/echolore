import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv, SessionUser } from "../lib/auth.js";
import { wikiRoutes } from "./wiki.js";

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
  getSignedUrlMock,
  getPageByIdMock,
  listVisiblePagesMock,
  searchVisiblePagesMock,
  updateBlockMock,
  updatePageMock,
  writeAuditLogMock,
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
  getSignedUrlMock: vi.fn(),
  getPageByIdMock: vi.fn(),
  listVisiblePagesMock: vi.fn(),
  searchVisiblePagesMock: vi.fn(),
  updateBlockMock: vi.fn(),
  updatePageMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@google-cloud/storage", () => ({
  Storage: vi.fn(() => ({
    bucket: vi.fn(() => ({
      file: vi.fn(() => ({
        getSignedUrl: getSignedUrlMock,
      })),
    })),
  })),
}));

vi.mock("../policies/authorization-policy.js", () => ({
  authorizePageResource: authorizePageResourceMock,
}));

vi.mock("../repositories/wiki/wiki-repository.js", () => ({
  createBlock: createBlockMock,
  deleteBlock: deleteBlockMock,
  deletePage: deletePageMock,
  getBlockById: getBlockByIdMock,
  getPageBlocks: getPageBlocksMock,
  getPageById: getPageByIdMock,
  updateBlock: updateBlockMock,
  updatePage: updatePageMock,
}));

vi.mock("../repositories/file/file-repository.js", () => ({
  getFileById: getFileByIdMock,
}));

vi.mock("../services/wiki/wiki-service.js", () => ({
  createPageWithAccessDefaults: createPageWithAccessDefaultsMock,
  detectPageCycle: detectPageCycleMock,
  listVisiblePages: listVisiblePagesMock,
  searchVisiblePages: searchVisiblePagesMock,
}));

vi.mock("../lib/audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
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
    getSignedUrlMock.mockReset();
    getPageByIdMock.mockReset();
    listVisiblePagesMock.mockReset();
    searchVisiblePagesMock.mockReset();
    updateBlockMock.mockReset();
    updatePageMock.mockReset();
    writeAuditLogMock.mockReset();
  });

  it("returns page detail with blocks for authorized users", async () => {
    const app = createApp({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
      role: "member",
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
      role: "member",
    });

    getPageByIdMock.mockResolvedValue({
      id: "page_1",
      title: "Home",
      parentId: null,
      authorId: "user_1",
      createdAt: new Date("2026-03-11T09:00:00.000Z"),
      updatedAt: new Date("2026-03-11T09:05:00.000Z"),
    });
    authorizePageResourceMock.mockResolvedValue({ allowed: false, reason: "missing-page-permission" });

    const response = await app.request("http://localhost/api/wiki/page_1");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(getPageBlocksMock).not.toHaveBeenCalled();
  });

  it("ignores client-supplied authorId and uses the session user for page creation", async () => {
    const app = createApp({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
      role: "member",
    });

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
      role: "member",
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
    getPageBlocksMock.mockResolvedValue([
      {
        id: "block_1",
        pageId: "page_1",
        type: "file",
        content: "design.pdf",
        properties: {
          fileId: "file_1",
        },
        sortOrder: 0,
        createdAt: new Date("2026-03-11T09:01:00.000Z"),
        updatedAt: new Date("2026-03-11T09:01:00.000Z"),
      },
    ]);
    getFileByIdMock.mockResolvedValue({
      id: "file_1",
      filename: "design.pdf",
      contentType: "application/pdf",
      size: 1234,
      gcsPath: "gs://corp-internal-files-dev/uploads/file_1-design.pdf",
      uploaderId: "user_1",
      createdAt: new Date("2026-03-11T09:01:00.000Z"),
    });
    getSignedUrlMock.mockResolvedValue(["https://signed.example/file_1"]);

    const response = await app.request("http://localhost/api/wiki/page_1/files/file_1/download");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://signed.example/file_1");
  });

  it("rejects attachment download when the file is not attached to the page", async () => {
    const app = createApp({
      id: "user_2",
      email: "member@example.com",
      name: "Member",
      role: "member",
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
    getPageBlocksMock.mockResolvedValue([
      {
        id: "block_1",
        pageId: "page_1",
        type: "file",
        content: "other.pdf",
        properties: {
          fileId: "file_other",
        },
        sortOrder: 0,
        createdAt: new Date("2026-03-11T09:01:00.000Z"),
        updatedAt: new Date("2026-03-11T09:01:00.000Z"),
      },
    ]);
    getFileByIdMock.mockResolvedValue({
      id: "file_1",
      filename: "design.pdf",
      contentType: "application/pdf",
      size: 1234,
      gcsPath: "gs://corp-internal-files-dev/uploads/file_1-design.pdf",
      uploaderId: "user_1",
      createdAt: new Date("2026-03-11T09:01:00.000Z"),
    });

    const response = await app.request("http://localhost/api/wiki/page_1/files/file_1/download");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "File not attached to page" });
  });
});
