import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SessionUser } from "../../lib/auth.js";
import { searchVisiblePages } from "../../services/wiki/wiki-service.js";

export function createWikiSearchTool(user: SessionUser) {
  return new DynamicStructuredTool({
    name: "wiki_search",
    description:
      "Search the internal wiki for pages matching a query. Returns page titles and snippets.",
    schema: z.object({
      query: z.string().describe("Search query to find relevant wiki pages"),
    }),
    func: async ({ query }) => {
      const { pages } = await searchVisiblePages(user, query, true);
      if (pages.length === 0) {
        return "No wiki pages found for that query.";
      }
      return pages
        .slice(0, 5)
        .map((p) => `- [${p.title}] (id: ${p.id})`)
        .join("\n");
    },
  });
}
