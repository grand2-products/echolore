import { beforeEach, describe, expect, it, vi } from "vitest";
import { pageInheritance, pagePermissions, pages, userGroupMemberships } from "../../db/schema.js";
import { createPageWithAccessDefaultsTx } from "./wiki-service.js";

describe("wiki-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps creator groups onto a new root page and disables parent inheritance", async () => {
    const pageRecord = {
      id: "page_1",
      title: "Root",
      parentId: null,
      authorId: "user_1",
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    };

    const insertMock = vi.fn((table: unknown) => {
      if (table === pages) {
        return {
          values: vi.fn(() => ({
            returning: vi.fn(async () => [pageRecord]),
          })),
        };
      }

      if (table === pageInheritance || table === pagePermissions) {
        return {
          values: vi.fn(async () => undefined),
        };
      }

      throw new Error("Unexpected table");
    });

    const whereMock = vi.fn(async () => [{ groupId: "group_eng" }, { groupId: "group_ops" }]);
    const tx = {
      insert: insertMock,
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table !== userGroupMemberships) throw new Error("Unexpected table");
          return {
            where: whereMock,
          };
        }),
      })),
    };

    await createPageWithAccessDefaultsTx(tx as never, {
      ...pageRecord,
    });

    expect(insertMock).toHaveBeenNthCalledWith(1, pages);
    expect(insertMock).toHaveBeenNthCalledWith(2, pageInheritance);
    expect(insertMock).toHaveBeenNthCalledWith(3, pagePermissions);
    expect(whereMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.results[1]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page_1",
        inheritFromParent: false,
      })
    );
    expect(insertMock.mock.results[2]?.value.values).toHaveBeenCalledWith([
      expect.objectContaining({
        pageId: "page_1",
        groupId: "group_eng",
        canRead: true,
        canWrite: true,
        canDelete: false,
      }),
      expect.objectContaining({
        pageId: "page_1",
        groupId: "group_ops",
        canRead: true,
        canWrite: true,
        canDelete: false,
      }),
    ]);
  });

  it("creates child pages with explicit inheritance and no direct group mapping", async () => {
    const pageRecord = {
      id: "page_child",
      title: "Child",
      parentId: "page_parent",
      authorId: "user_1",
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    };

    const insertMock = vi.fn((table: unknown) => {
      if (table === pages) {
        return {
          values: vi.fn(() => ({
            returning: vi.fn(async () => [pageRecord]),
          })),
        };
      }

      if (table === pageInheritance) {
        return {
          values: vi.fn(async () => undefined),
        };
      }

      throw new Error("Unexpected table");
    });

    const tx = {
      insert: insertMock,
      select: vi.fn(),
    };

    await createPageWithAccessDefaultsTx(tx as never, {
      ...pageRecord,
    });

    expect(insertMock).toHaveBeenNthCalledWith(1, pages);
    expect(insertMock).toHaveBeenNthCalledWith(2, pageInheritance);
    expect(insertMock).not.toHaveBeenCalledWith(pagePermissions);
    expect(insertMock.mock.results[1]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page_child",
        inheritFromParent: true,
      })
    );
    expect(tx.select).not.toHaveBeenCalled();
  });
});
