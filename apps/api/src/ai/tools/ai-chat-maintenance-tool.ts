import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { SessionUser } from "../../lib/auth.js";
import {
  auditWikiMaintenance,
  formatMaintenanceReportText,
} from "../../services/wiki/wiki-maintenance-service.js";
import type { AiChatToolResult } from "./ai-chat-tools.js";

/**
 * Read-only knowledge maintenance audit. Returns governance findings
 * (review status from the knowledge registry) and content findings
 * (stale / empty pages) for pages the current user may read.
 */
export function createAiChatMaintenanceReportTool(user: SessionUser) {
  const referencedPages: AiChatToolResult[] = [];

  const maintenanceTool = new DynamicStructuredTool({
    name: "wiki_maintenance_report",
    description:
      "Audit the health of wiki knowledge and return a maintenance report: overdue or upcoming knowledge reviews, unapproved knowledge entries, registry drift (deleted but still registered), and stale or empty pages. Use this when the user asks about knowledge maintenance, page freshness, review status, or wiki cleanup.",
    schema: z.object({}),
    func: async () => {
      const report = await auditWikiMaintenance(user);

      for (const finding of report.findings) {
        referencedPages.push({
          pageId: finding.pageId,
          pageTitle: finding.pageTitle,
        });
      }

      return formatMaintenanceReportText(report);
    },
  });

  return { maintenanceTool, referencedPages };
}
