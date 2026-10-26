import type { SessionUser } from "../../lib/auth.js";
import { listGroups } from "../../repositories/admin/admin-repository.js";
import { createKnowledgePage } from "../../repositories/marketing/marketing-knowledge-repository.js";
import { getPageById, importPageWithBlocks } from "../../repositories/wiki/wiki-repository.js";
import { parseMarkdown } from "../wiki/import-parser.js";
import { ensureGeneralSpace, ensureTeamSpaceForGroup } from "../wiki/space-service.js";
import { KNOWLEDGE_TEMPLATE, type KnowledgeTemplatePage } from "./marketing-knowledge-templates.js";
import { getMarketingSettings, updateMarketingSettings } from "./marketing-settings-service.js";

export class KnowledgeBootstrapError extends Error {
  constructor(
    message: string,
    readonly code: "ALREADY_BOOTSTRAPPED" | "GROUP_NOT_FOUND"
  ) {
    super(message);
    this.name = "KnowledgeBootstrapError";
  }
}

const DAY_MS = 86_400_000;

export function nextReviewDate(from: Date, intervalDays: number): Date {
  return new Date(from.getTime() + intervalDays * DAY_MS);
}

/**
 * Creates the marketing knowledge tree (01 方針 … 06 教育・継承, templates,
 * KPI辞書) in the Wiki and registers every page in the governance registry.
 * Pages go into the given group's team space, or the General space.
 */
export async function bootstrapMarketingKnowledge(
  user: SessionUser,
  groupId: string | null
): Promise<{ spaceId: string; rootPageId: string; createdPageIds: string[] }> {
  const settings = await getMarketingSettings();
  if (settings.knowledgeRootPageId) {
    const existing = await getPageById(settings.knowledgeRootPageId);
    if (existing && !existing.deletedAt) {
      throw new KnowledgeBootstrapError(
        "Marketing knowledge has already been created",
        "ALREADY_BOOTSTRAPPED"
      );
    }
  }

  let spaceId: string;
  if (groupId) {
    const group = (await listGroups()).find((g) => g.id === groupId);
    if (!group) throw new KnowledgeBootstrapError("Group not found", "GROUP_NOT_FOUND");
    spaceId = (await ensureTeamSpaceForGroup(group.id, group.name)).id;
  } else {
    spaceId = (await ensureGeneralSpace()).id;
  }

  const createdPageIds: string[] = [];
  const create = async (node: KnowledgeTemplatePage, parentId: string | null): Promise<string> => {
    const now = new Date();
    const { page } = await importPageWithBlocks({
      pageId: crypto.randomUUID(),
      title: node.title,
      spaceId,
      parentId,
      authorId: user.id,
      now,
      blockDrafts: parseMarkdown(node.markdown),
    });
    createdPageIds.push(page.id);
    await createKnowledgePage({
      pageId: page.id,
      layer: node.layer,
      docType: node.docType,
      purpose: node.purpose,
      scope: null,
      ownerUserId: user.id,
      deputyUserId: null,
      reviewIntervalDays: node.reviewIntervalDays,
      relatedAssetIds: [],
      notes: null,
    });
    for (const child of node.children ?? []) {
      await create(child, page.id);
    }
    return page.id;
  };

  const rootPageId = await create(KNOWLEDGE_TEMPLATE, null);
  await updateMarketingSettings({ knowledgeSpaceId: spaceId, knowledgeRootPageId: rootPageId });
  return { spaceId, rootPageId, createdPageIds };
}
