import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SessionUser } from "../../lib/auth.js";
import { canReadPage } from "../../policies/authorization-policy.js";
import { getPageById, getPageBlocks } from "../../repositories/wiki/wiki-repository.js";
import { searchByVector } from "../../services/wiki/vector-search-service.js";
import { stripHtml } from "../../lib/html-utils.js";

export interface WikiChatToolResult {
  pageId: string;
  pageTitle: string;
  snippet?: string;
}

export function createWikiChatSearchTool(user: SessionUser) {
  const referencedPages: WikiChatToolResult[] = [];

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

export function createWikiChatReadPageTool(user: SessionUser) {
  const referencedPages: WikiChatToolResult[] = [];

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
