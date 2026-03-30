import { z } from "zod";

export const createPageSchema = z.object({
  title: z.string().min(1).max(500),
  parentId: z.string().optional(),
  spaceId: z.string().optional(),
});

export const updatePageSchema = z.object({
  title: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
});

export const createBlockSchema = z.object({
  pageId: z.string(),
  type: z.string().max(50),
  content: z.string().max(500_000).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number(),
});

export const updateBlockSchema = z.object({
  type: z.string().max(50).optional(),
  content: z.string().max(500_000).nullable().optional(),
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
  sortOrder: z.number().optional(),
});

export const setPagePermissionsSchema = z.object({
  inheritFromParent: z.boolean().optional(),
  permissions: z.array(
    z.object({
      groupId: z.string(),
      canRead: z.boolean(),
      canWrite: z.boolean(),
      canDelete: z.boolean(),
    })
  ),
});

export const updateInheritanceSchema = z.object({ inheritFromParent: z.boolean() });
