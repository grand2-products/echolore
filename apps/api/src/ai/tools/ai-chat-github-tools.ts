import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SessionUser } from "../../lib/auth.js";
import {
  readGithubFileText,
  searchGithubForUser,
} from "../../services/github/github-vector-search-service.js";
import { escapeXmlTags } from "../sanitize-prompt-input.js";

export function buildGithubLink(
  owner: string,
  name: string,
  branch: string,
  filePath: string
): string {
  const encodedPath = filePath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob/${encodeURIComponent(branch)}/${encodedPath}`;
}

export interface GithubToolResult {
  githubFileId: string;
  githubFileName: string;
  githubRepoOwner: string;
  githubRepoName: string;
  githubFilePath: string;
  githubRepoBranch: string;
  githubLink?: string;
  snippet?: string;
}

export function createAiChatGithubSearchTool(user: SessionUser) {
  const referencedFiles: GithubToolResult[] = [];

  const githubSearchTool = new DynamicStructuredTool({
    name: "github_search",
    description:
      "Search indexed GitHub repository documentation for content matching a query. " +
      "Returns file names, paths, and snippets. " +
      "Use this when wiki and drive searches are insufficient and the answer may be in GitHub docs.",
    schema: z.object({
      query: z.string().describe("Search query"),
    }),
    func: async ({ query }) => {
      const results = await searchGithubForUser(user, query, 5);

      if (results.length === 0) return "No GitHub docs found for that query.";

      const output: string[] = [];
      for (const r of results) {
        const snippet = escapeXmlTags(r.chunkText.slice(0, 200));
        const link = buildGithubLink(r.repoOwner, r.repoName, r.repoBranch, r.filePath);
        referencedFiles.push({
          githubFileId: r.fileId,
          githubFileName: r.fileName,
          githubRepoOwner: r.repoOwner,
          githubRepoName: r.repoName,
          githubFilePath: r.filePath,
          githubRepoBranch: r.repoBranch,
          githubLink: link,
          snippet: snippet || undefined,
        });
        output.push(
          `- [${escapeXmlTags(r.fileName)}] (${r.repoOwner}/${r.repoName}@${r.repoBranch}:${r.filePath})\n  Snippet: ${snippet}`
        );
      }

      return output.join("\n");
    },
  });

  return { githubSearchTool, referencedFiles };
}

export function createAiChatGithubReadTool(user: SessionUser) {
  const referencedFiles: GithubToolResult[] = [];

  const githubReadTool = new DynamicStructuredTool({
    name: "github_read",
    description: "Read the content of an indexed GitHub file (up to 8000 characters).",
    schema: z.object({
      fileId: z.string().describe("GitHub file ID to read"),
    }),
    func: async ({ fileId }) => {
      const result = await readGithubFileText(fileId, user);
      if (!result) return "File not found or you do not have permission to read it.";

      const link = buildGithubLink(
        result.repoOwner,
        result.repoName,
        result.repoBranch,
        result.filePath
      );
      referencedFiles.push({
        githubFileId: result.fileId,
        githubFileName: result.fileName,
        githubRepoOwner: result.repoOwner,
        githubRepoName: result.repoName,
        githubFilePath: result.filePath,
        githubRepoBranch: result.repoBranch,
        githubLink: link,
      });

      return `# ${escapeXmlTags(result.fileName)}\n\n${escapeXmlTags(result.text)}`;
    },
  });

  return { githubReadTool, referencedFiles };
}
