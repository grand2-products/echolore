import { UserRole } from "@echolore/shared/contracts";
import type { SessionUser } from "../../lib/auth.js";
import { canReadPage } from "../../policies/authorization-policy.js";
import type { KnowledgeRow } from "../../repositories/marketing/marketing-knowledge-repository.js";
import { listKnowledgePages } from "../../repositories/marketing/marketing-knowledge-repository.js";
import {
  findPagesWithExplicitDeny,
  listFirstSnippetsByPageIds,
  listRecentPagesAdmin,
  listRecentVisiblePagesForUser,
} from "../../repositories/wiki/wiki-repository.js";

const DAY_MS = 86_400_000;

export type MaintenanceFindingType =
  | "review_overdue"
  | "review_due_soon"
  | "draft_unapproved"
  | "registry_drift"
  | "stale_page"
  | "empty_page";

export interface MaintenanceFinding {
  type: MaintenanceFindingType;
  severity: "high" | "medium" | "low";
  pageId: string;
  pageTitle: string;
  detail: string;
}

export interface MaintenanceReport {
  generatedAt: string;
  scannedPages: number;
  registeredPages: number;
  findings: MaintenanceFinding[];
  summary: Record<MaintenanceFindingType, number>;
}

export interface MaintenanceAuditOptions {
  now?: Date;
  staleDays?: number;
  dueSoonDays?: number;
  maxFindings?: number;
  scanLimit?: number;
}

const SEVERITY_ORDER: Record<MaintenanceFinding["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function emptyMaintenanceSummary(): Record<MaintenanceFindingType, number> {
  return {
    review_overdue: 0,
    review_due_soon: 0,
    draft_unapproved: 0,
    registry_drift: 0,
    stale_page: 0,
    empty_page: 0,
  };
}

export interface ContentPage {
  pageId: string;
  pageTitle: string;
  updatedAt: Date;
}

/**
 * Registry-driven findings (knowledge governance).
 * Rows must already be permission-filtered by the caller.
 */
export function buildRegistryFindings(
  rows: KnowledgeRow[],
  now: Date,
  dueSoonDays: number
): MaintenanceFinding[] {
  const findings: MaintenanceFinding[] = [];

  for (const row of rows) {
    const title = row.pageTitle ?? row.pageId;

    if (row.pageDeletedAt !== null || row.pageTitle === null) {
      findings.push({
        type: "registry_drift",
        severity: "high",
        pageId: row.pageId,
        pageTitle: title,
        detail: "Registered knowledge page has been deleted; unregister or replace it",
      });
      continue;
    }

    if (row.status === "draft") {
      findings.push({
        type: "draft_unapproved",
        severity: "medium",
        pageId: row.pageId,
        pageTitle: title,
        detail: "Knowledge entry is registered but never approved",
      });
      continue;
    }

    // Deprecated entries are intentionally retired — not a finding.
    if (row.status !== "approved" || row.nextReviewAt === null) continue;

    const overdueDays = Math.floor((now.getTime() - row.nextReviewAt.getTime()) / DAY_MS);
    if (overdueDays >= 0) {
      findings.push({
        type: "review_overdue",
        severity: "high",
        pageId: row.pageId,
        pageTitle: title,
        detail: `Review is overdue by ${overdueDays} day(s)`,
      });
      continue;
    }

    if (-overdueDays <= dueSoonDays) {
      findings.push({
        type: "review_due_soon",
        severity: "low",
        pageId: row.pageId,
        pageTitle: title,
        detail: `Review is due in ${-overdueDays} day(s)`,
      });
    }
  }

  return findings;
}

/**
 * Content heuristics over scanned pages.
 * `snippetPageIds` are page IDs that have at least one non-empty text block.
 */
export function buildContentFindings(
  pages: ContentPage[],
  snippetPageIds: Set<string>,
  now: Date,
  staleDays: number
): MaintenanceFinding[] {
  const findings: MaintenanceFinding[] = [];
  const staleThreshold = now.getTime() - staleDays * DAY_MS;

  for (const page of pages) {
    if (!snippetPageIds.has(page.pageId)) {
      findings.push({
        type: "empty_page",
        severity: "low",
        pageId: page.pageId,
        pageTitle: page.pageTitle,
        detail: "Page has no text content",
      });
      continue;
    }

    if (page.updatedAt.getTime() < staleThreshold) {
      const staleDaysActual = Math.floor((now.getTime() - page.updatedAt.getTime()) / DAY_MS);
      findings.push({
        type: "stale_page",
        severity: "medium",
        pageId: page.pageId,
        pageTitle: page.pageTitle,
        detail: `Last updated ${staleDaysActual} day(s) ago`,
      });
    }
  }

  return findings;
}

export async function auditWikiMaintenance(
  user: SessionUser,
  options: MaintenanceAuditOptions = {}
): Promise<MaintenanceReport> {
  const now = options.now ?? new Date();
  const staleDays = options.staleDays ?? 180;
  const dueSoonDays = options.dueSoonDays ?? 14;
  const maxFindings = options.maxFindings ?? 50;
  const scanLimit = options.scanLimit ?? 500;

  // Registry findings — same readability rule as the knowledge list API:
  // entries are only visible for pages the user may read.
  const knowledgeRows = await listKnowledgePages();
  const readableRows = await filterReadableRows(user, knowledgeRows);
  const registryFindings = buildRegistryFindings(readableRows, now, dueSoonDays);

  // Content findings — permission-filtered page list.
  let pages =
    user.role === UserRole.Admin
      ? await listRecentPagesAdmin(scanLimit)
      : await listRecentVisiblePagesForUser(user.id, scanLimit);

  if (user.role !== UserRole.Admin && pages.length > 0) {
    const denied = await findPagesWithExplicitDeny(
      pages.map((p) => p.pageId),
      user.id
    );
    if (denied.size > 0) {
      pages = pages.filter((p) => !denied.has(p.pageId));
    }
  }

  const snippets = await listFirstSnippetsByPageIds(pages.map((p) => p.pageId));
  const snippetPageIds = new Set(snippets.map((s) => s.pageId));
  const contentFindings = buildContentFindings(pages, snippetPageIds, now, staleDays);

  const summary = emptyMaintenanceSummary();
  for (const f of [...registryFindings, ...contentFindings]) summary[f.type] += 1;

  const findings = [...registryFindings, ...contentFindings]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, maxFindings);

  return {
    generatedAt: now.toISOString(),
    scannedPages: pages.length,
    registeredPages: readableRows.length,
    findings,
    summary,
  };
}

const FINDING_LABELS: Record<MaintenanceFindingType, string> = {
  review_overdue: "Review overdue",
  review_due_soon: "Review due soon",
  draft_unapproved: "Unapproved knowledge entry",
  registry_drift: "Registry drift",
  stale_page: "Stale page",
  empty_page: "Empty page",
};

/** Render a report as compact text (shared by the chat tool and MCP tool). */
export function formatMaintenanceReportText(report: MaintenanceReport): string {
  const lines: string[] = [
    `Scanned ${report.scannedPages} page(s), ${report.registeredPages} registered knowledge page(s).`,
    `Findings: ${report.findings.length} (review_overdue: ${report.summary.review_overdue}, review_due_soon: ${report.summary.review_due_soon}, draft_unapproved: ${report.summary.draft_unapproved}, registry_drift: ${report.summary.registry_drift}, stale_page: ${report.summary.stale_page}, empty_page: ${report.summary.empty_page})`,
  ];

  if (report.findings.length === 0) {
    lines.push("No maintenance issues found.");
    return lines.join("\n");
  }

  for (const finding of report.findings) {
    lines.push(
      `- [${FINDING_LABELS[finding.type]}] ${finding.pageTitle} (id: ${finding.pageId}) — ${finding.detail}`
    );
  }

  return lines.join("\n");
}

async function filterReadableRows(user: SessionUser, rows: KnowledgeRow[]) {
  const checks = await Promise.all(
    rows.map((r) => (r.pageAuthorId ? canReadPage(user, r.pageId, r.pageAuthorId) : false))
  );
  return rows.filter((_, i) => checks[i]);
}
