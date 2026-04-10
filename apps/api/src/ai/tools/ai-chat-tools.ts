import { UserRole } from "@echolore/shared/contracts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SessionUser } from "../../lib/auth.js";
import { stripHtml } from "../../lib/html-utils.js";
import { canReadPage } from "../../policies/authorization-policy.js";
import {
  findPagesWithExplicitDeny,
  getPageBlocks,
  getPageById,
  listFirstSnippetsByPageIds,
  listRecentPagesAdmin,
  listRecentVisiblePagesForUser,
} from "../../repositories/wiki/wiki-repository.js";
import { searchByVector } from "../../services/wiki/vector-search-service.js";

export interface AiChatToolResult {
  pageId: string;
  pageTitle: string;
  snippet?: string;
  // Drive-specific (present when source === "drive")
  driveFileId?: string;
  driveFileName?: string;
  driveLink?: string;
  // GitHub-specific (present when source === "github")
  githubFileId?: string;
  githubFileName?: string;
  githubRepoOwner?: string;
  githubRepoName?: string;
  githubRepoBranch?: string;
  githubFilePath?: string;
  githubLink?: string;
  source?: "wiki" | "drive" | "github";
}

export function createAiChatSearchTool(user: SessionUser) {
  const referencedPages: AiChatToolResult[] = [];

  const searchTool = new DynamicStructuredTool({
    name: "wiki_search",
    description:
      "Search the internal wiki for pages matching a query using vector similarity. Returns page titles, IDs, and content snippets.",
    schema: z.object({
      query: z.string().describe("Search query to find relevant wiki pages"),
    }),
    func: async ({ query }) => {
      const results = await searchByVector(query, 10);
      if (results.length === 0) {
        return "No wiki pages found for that query.";
      }

      const output: string[] = [];
      for (const r of results.slice(0, 5)) {
        // Check permission — "" as ownerUserId skips owner check,
        // falls through to group/space permission evaluation
        const canRead = await canReadPage(user, r.pageId, "");
        if (!canRead) continue;

        const snippet = r.chunkText.slice(0, 200);
        referencedPages.push({
          pageId: r.pageId,
          pageTitle: r.pageTitle,
          snippet: snippet || undefined,
        });

        output.push(
          `- [${r.pageTitle}] (id: ${r.pageId}, similarity: ${r.similarity.toFixed(3)})\n  Snippet: ${snippet}`
        );
      }

      return output.length > 0
        ? output.join("\n")
        : "No accessible wiki pages found for that query.";
    },
  });

  return { searchTool, referencedPages };
}

export function createAiChatListPagesTool(user: SessionUser) {
  // Discovery tool — does NOT track citations.
  // If the agent wants to cite a specific page it should use wiki_read_page,
  // which properly records the citation.
  const referencedPages: AiChatToolResult[] = [];

  const listPagesTool = new DynamicStructuredTool({
    name: "wiki_list_pages",
    description:
      "List wiki pages the user can access, ordered by most recently updated. Use this when the user wants to browse, discover, or be introduced to articles without a specific search topic. To cite a specific page, follow up with wiki_read_page.",
    schema: z.object({
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(10)
        .describe("Maximum number of pages to return (default 10)"),
    }),
    func: async ({ limit }) => {
      // SQL-level permission filter + LIMIT — no full-table scan.
      // Over-fetch to compensate for page-level deny post-filter.
      const overFetchLimit = limit + 5;
      let pages =
        user.role === UserRole.Admin
          ? await listRecentPagesAdmin(overFetchLimit)
          : await listRecentVisiblePagesForUser(user.id, overFetchLimit);

      // Post-filter: exclude pages with explicit page-level deny
      if (user.role !== UserRole.Admin && pages.length > 0) {
        const allIds = pages.map((p) => p.pageId);
        const denied = await findPagesWithExplicitDeny(allIds, user.id);
        if (denied.size > 0) {
          pages = pages.filter((p) => !denied.has(p.pageId));
        }
      }

      pages = pages.slice(0, limit);

      if (pages.length === 0) {
        return "No wiki pages are available.";
      }

      // DISTINCT ON — one query, one row per page, lowest sortOrder with content
      const pageIds = pages.map((p) => p.pageId);
      const snippets = await listFirstSnippetsByPageIds(pageIds);
      const snippetMap = new Map(
        snippets.map((s) => [s.pageId, stripHtml(s.snippet).slice(0, 150)])
      );

      const output: string[] = [];
      for (const page of pages) {
        const snippet = snippetMap.get(page.pageId) ?? "";
        const updatedAt = new Date(page.updatedAt).toISOString().slice(0, 10);

        output.push(
          `- [${page.pageTitle}] (id: ${page.pageId}, updated: ${updatedAt})${snippet ? `\n  ${snippet}` : ""}`
        );
      }

      return output.join("\n");
    },
  });

  return { listPagesTool, referencedPages };
}

export function createAiChatReadPageTool(user: SessionUser) {
  const referencedPages: AiChatToolResult[] = [];

  const readPageTool = new DynamicStructuredTool({
    name: "wiki_read_page",
    description:
      "Read the full content of a wiki page by its ID. Use this when you need more detail than the search snippet provides.",
    schema: z.object({
      pageId: z.string().describe("The ID of the wiki page to read"),
    }),
    func: async ({ pageId }) => {
      const page = await getPageById(pageId);
      if (!page) {
        return "Page not found.";
      }

      const canRead = await canReadPage(user, page.id, page.authorId);
      if (!canRead) {
        return "You do not have permission to read this page.";
      }

      const pageBlocks = await getPageBlocks(page.id);
      const content = pageBlocks
        .map((b) => (b.content ? stripHtml(b.content) : ""))
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000);

      referencedPages.push({
        pageId: page.id,
        pageTitle: page.title,
      });

      return `# ${page.title}\n\n${content}`;
    },
  });

  return { readPageTool, referencedPages };
}
