import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPageWithAccessDefaultsTx } from "../../repositories/wiki/wiki-repository.js";

describe("wiki-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps creator groups onto a new root page and disables parent inheritance", async () => {
    const pageRecord = {
      id: "page_1",
      title: "Root",
      spaceId: "00000000-0000-0000-0000-000000000001",
      parentId: null,
      authorId: "user_1",
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
      deletedAt: null,
    };

    const insertedTables: string[] = [];
    const insertedValues: unknown[] = [];

    const trx = {
      insertInto: vi.fn((table: string) => {
        insertedTables.push(table);
        return {
          values: vi.fn((values: unknown) => {
            insertedValues.push(values);
            if (table === "pages") {
              return {
                returningAll: vi.fn(() => ({
                  executeTakeFirst: vi.fn(async () => pageRecord),
                })),
              };
            }
            return {
              execute: vi.fn(async () => undefined),
            };
          }),
        };
      }),
      selectFrom: vi.fn(() => ({
        select: vi.fn(() => ({
          where: vi.fn(() => ({
            execute: vi.fn(async () => [{ groupId: "group_eng" }, { groupId: "group_ops" }]),
          })),
        })),
      })),
    };

    await createPageWithAccessDefaultsTx(trx as never, {
      id: "page_1",
      title: "Root",
      spaceId: "00000000-0000-0000-0000-000000000001",
      parentId: null,
      authorId: "user_1",
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    });

    expect(insertedTables[0]).toBe("pages");
    expect(insertedTables[1]).toBe("page_inheritance");
    expect(insertedTables[2]).toBe("page_permissions");
    expect(insertedValues[1]).toEqual(
      expect.objectContaining({
        pageId: "page_1",
        inheritFromParent: false,
      })
    );
    expect(insertedValues[2]).toEqual([
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
      spaceId: "00000000-0000-0000-0000-000000000001",
      parentId: "page_parent",
      authorId: "user_1",
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
      deletedAt: null,
    };

    const insertedTables: string[] = [];
    const insertedValues: unknown[] = [];

    const trx = {
      insertInto: vi.fn((table: string) => {
        insertedTables.push(table);
        return {
          values: vi.fn((values: unknown) => {
            insertedValues.push(values);
            if (table === "pages") {
              return {
                returningAll: vi.fn(() => ({
                  executeTakeFirst: vi.fn(async () => pageRecord),
                })),
              };
            }
            return {
              execute: vi.fn(async () => undefined),
            };
          }),
        };
      }),
      selectFrom: vi.fn(),
    };

    await createPageWithAccessDefaultsTx(trx as never, {
      id: "page_child",
      title: "Child",
      spaceId: "00000000-0000-0000-0000-000000000001",
      parentId: "page_parent",
      authorId: "user_1",
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    });

    expect(insertedTables[0]).toBe("pages");
    expect(insertedTables[1]).toBe("page_inheritance");
    expect(insertedTables).not.toContain("page_permissions");
    expect(insertedValues[1]).toEqual(
      expect.objectContaining({
        pageId: "page_child",
        inheritFromParent: true,
      })
    );
    expect(trx.selectFrom).not.toHaveBeenCalled();
  });
});
