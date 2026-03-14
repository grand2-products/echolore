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
  type: z.string(),
  content: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  sortOrder: z.number(),
});

export const updateBlockSchema = z.object({
  type: z.string().optional(),
  content: z.string().nullable().optional(),
  properties: z.record(z.unknown()).nullable().optional(),
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
