import type { Page } from "../../db/schema.js";
import { writeAuditLog } from "../../lib/audit.js";
import type { SessionUser } from "../../lib/auth.js";
import { importPageWithBlocks } from "../../repositories/wiki/wiki-repository.js";
import { indexPageBackground } from "./embedding-service.js";
import { parseMarkdown } from "./import-parser.js";
import { canAccessSpace, GENERAL_SPACE_ID, getSpaceById } from "./space-service.js";

const MAX_TITLE_LENGTH = 200;
const MAX_MARKDOWN_LENGTH = 100_000;

export class ArticleCreationError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_TITLE" | "INVALID_CONTENT" | "SPACE_NOT_FOUND" | "SPACE_FORBIDDEN"
  ) {
    super(message);
    this.name = "ArticleCreationError";
  }
}

/**
 * Create a new wiki page from markdown, on behalf of a user who explicitly
 * asked an AI agent to save/share the content as an article.
 *
 * New-page creation only — existing pages are never modified. The page author
 * is always the requesting user (server-side identity, never client-supplied).
 */
export async function createWikiArticleFromMarkdown(input: {
  user: SessionUser;
  title: string;
  markdown: string;
  spaceId?: string;
}): Promise<Page> {
  const title = input.title.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    throw new ArticleCreationError(
      `Title must be 1-${MAX_TITLE_LENGTH} characters`,
      "INVALID_TITLE"
    );
  }

  const markdown = input.markdown.trim();
  if (markdown.length === 0) {
    throw new ArticleCreationError("Content is empty", "INVALID_CONTENT");
  }
  if (markdown.length > MAX_MARKDOWN_LENGTH) {
    throw new ArticleCreationError(
      `Content too large (max ${MAX_MARKDOWN_LENGTH} characters)`,
      "INVALID_CONTENT"
    );
  }

  const targetSpaceId = input.spaceId?.trim() || GENERAL_SPACE_ID;
  const space = await getSpaceById(targetSpaceId);
  if (!space) {
    throw new ArticleCreationError("Space not found", "SPACE_NOT_FOUND");
  }
  if (!(await canAccessSpace(input.user, space, "write"))) {
    throw new ArticleCreationError(
      "You do not have permission to create pages in this space",
      "SPACE_FORBIDDEN"
    );
  }

  const blockDrafts = parseMarkdown(markdown);
  if (blockDrafts.length === 0) {
    throw new ArticleCreationError("Content is empty", "INVALID_CONTENT");
  }

  const { page } = await importPageWithBlocks({
    pageId: crypto.randomUUID(),
    title,
    spaceId: targetSpaceId,
    parentId: null,
    authorId: input.user.id,
    now: new Date(),
    blockDrafts,
  });

  indexPageBackground(page.id);

  await writeAuditLog({
    actorUserId: input.user.id,
    actorEmail: input.user.email,
    action: "wiki.page.create.agent",
    resourceType: "wiki-page",
    resourceId: page.id,
    metadata: { title: page.title, spaceId: targetSpaceId, blockCount: blockDrafts.length },
  });

  return page;
}
