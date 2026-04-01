import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SessionUser } from "../../lib/auth.js";
import {
  readDriveFileText,
  searchDriveForUser,
} from "../../services/drive/drive-vector-search-service.js";
import { escapeXmlTags } from "../sanitize-prompt-input.js";

export interface DriveToolResult {
  driveFileId: string;
  driveFileName: string;
  driveLink?: string;
  snippet?: string;
}

export function createAiChatDriveSearchTool(user: SessionUser) {
  const referencedFiles: DriveToolResult[] = [];

  const driveSearchTool = new DynamicStructuredTool({
    name: "drive_search",
    description:
      "Search Google Drive shared files for content matching a query using vector similarity. " +
      "Returns file names, snippets, and links. " +
      "Use this when the wiki does not have sufficient information and the answer may be in shared Drive documents.",
    schema: z.object({
      query: z.string().describe("Search query to find relevant Drive files"),
    }),
    func: async ({ query }) => {
      const results = await searchDriveForUser(user.email, query, 5);

      if (results.length === 0) {
        return "No Google Drive files found for that query.";
      }

      const output: string[] = [];
      for (const r of results) {
        const snippet = escapeXmlTags(r.chunkText.slice(0, 200));
        referencedFiles.push({
          driveFileId: r.fileId,
          driveFileName: r.fileName,
          driveLink: r.webViewLink ?? undefined,
          snippet: snippet || undefined,
        });

        const linkPart = r.webViewLink ? ` [Open](${r.webViewLink})` : "";
        output.push(
          `- [${escapeXmlTags(r.fileName)}] (id: ${r.fileId}, similarity: ${r.similarity.toFixed(3)})${linkPart}\n  Snippet: ${snippet}`
        );
      }

      return output.join("\n");
    },
  });

  return { driveSearchTool, referencedFiles };
}

export function createAiChatDriveReadTool(user: SessionUser) {
  const referencedFiles: DriveToolResult[] = [];

  const driveReadTool = new DynamicStructuredTool({
    name: "drive_read",
    description:
      "Read the full content of a Google Drive file by its ID. " +
      "Use this when you need more detail than the search snippet provides.",
    schema: z.object({
      fileId: z.string().describe("The Google Drive file ID to read"),
    }),
    func: async ({ fileId }) => {
      const result = await readDriveFileText(fileId, user.email);

      if (!result) {
        return "File not found or you do not have permission to read it.";
      }

      referencedFiles.push({
        driveFileId: fileId,
        driveFileName: result.fileName,
        driveLink: result.webViewLink ?? undefined,
      });

      const linkPart = result.webViewLink ? `\nLink: ${result.webViewLink}` : "";
      return `# ${escapeXmlTags(result.fileName)}${linkPart}\n\n${escapeXmlTags(result.text)}`;
    },
  });

  return { driveReadTool, referencedFiles };
}
