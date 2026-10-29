import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SessionUser } from "../../lib/auth.js";
import {
  ArticleCreationError,
  createWikiArticleFromMarkdown,
} from "../../services/wiki/wiki-article-creation-service.js";
import type { AiChatToolResult } from "./ai-chat-tools.js";

/**
 * Saves conversation content as a new wiki page. Only for explicit user
 * requests ("記事にして", "Wikiに残して", "シェア用にまとめて") — the agent
 * must never create pages on its own initiative.
 */
export function createAiChatCreatePageTool(user: SessionUser) {
  const referencedPages: AiChatToolResult[] = [];

  const createPageTool = new DynamicStructuredTool({
    name: "wiki_create_page",
    description:
      "Create a new wiki page from markdown content. Use this ONLY when the user explicitly asks to save, share, or publish the conversation content as a wiki article. Never use it without an explicit request. The page is created under the requesting user's name and can be edited or deleted afterwards.",
    schema: z.object({
      title: z.string().describe("Title for the new wiki page"),
      markdown: z
        .string()
        .describe("Full article body in markdown (headings, lists, code blocks supported)"),
      spaceId: z.string().optional().describe("Target space ID (defaults to General)"),
    }),
    func: async ({ title, markdown, spaceId }) => {
      try {
        const page = await createWikiArticleFromMarkdown({ user, title, markdown, spaceId });

        referencedPages.push({
          pageId: page.id,
          pageTitle: page.title,
        });

        return `Created wiki page: ${page.title} (id: ${page.id}). Tell the user they can review and edit it from the page link.`;
      } catch (error) {
        if (error instanceof ArticleCreationError) {
          return `Could not create the page: ${error.message}`;
        }
        console.error(
          JSON.stringify({
            event: "ai-chat.create-page.error",
            error: error instanceof Error ? error.message : "Unknown",
          })
        );
        return "An error occurred while creating the page. Please try again.";
      }
    },
  });

  return { createPageTool, referencedPages };
}
