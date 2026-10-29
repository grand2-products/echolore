import { describe, expect, it } from "vitest";
import type { KnowledgeRow } from "../../repositories/marketing/marketing-knowledge-repository.js";
import {
  buildContentFindings,
  buildRegistryFindings,
  type ContentPage,
} from "./wiki-maintenance-service.js";

const NOW = new Date("2026-10-29T00:00:00.000Z");
const DAY_MS = 86_400_000;

function knowledgeRow(partial: Partial<KnowledgeRow>): KnowledgeRow {
  return {
    id: "mkk_test",
    pageId: "p1",
    layer: "03",
    docType: "manual",
    purpose: null,
    scope: null,
    ownerUserId: null,
    deputyUserId: null,
    status: "approved",
    reviewIntervalDays: 90,
    lastReviewedAt: null,
    nextReviewAt: null,
    approvedByUserId: null,
    approvedAt: null,
    replacedByPageId: null,
    relatedAssetIds: [],
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    pageTitle: "Page p1",
    pageAuthorId: "u1",
    pageUpdatedAt: NOW,
    pageDeletedAt: null,
    ...partial,
  } as KnowledgeRow;
}

describe("buildRegistryFindings", () => {
  it("flags approved pages past their review deadline as overdue", () => {
    const row = knowledgeRow({
      pageId: "p1",
      pageTitle: "Overdue page",
      nextReviewAt: new Date(NOW.getTime() - 10 * DAY_MS),
    });

    const findings = buildRegistryFindings([row], NOW, 14);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      type: "review_overdue",
      severity: "high",
      pageId: "p1",
      pageTitle: "Overdue page",
    });
    expect(findings[0]?.detail).toContain("10 day(s)");
  });

  it("flags pages due within the soon-window", () => {
    const row = knowledgeRow({
      nextReviewAt: new Date(NOW.getTime() + 3 * DAY_MS),
    });

    const findings = buildRegistryFindings([row], NOW, 14);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ type: "review_due_soon", severity: "low" });
  });

  it("does not flag pages reviewed recently", () => {
    const row = knowledgeRow({
      nextReviewAt: new Date(NOW.getTime() + 60 * DAY_MS),
    });

    expect(buildRegistryFindings([row], NOW, 14)).toHaveLength(0);
  });

  it("flags never-approved draft entries", () => {
    const row = knowledgeRow({ status: "draft", nextReviewAt: new Date(NOW.getTime() - DAY_MS) });

    const findings = buildRegistryFindings([row], NOW, 14);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ type: "draft_unapproved", severity: "medium" });
  });

  it("flags registry entries whose page is deleted", () => {
    const row = knowledgeRow({ pageDeletedAt: NOW, pageTitle: "Deleted page" });

    const findings = buildRegistryFindings([row], NOW, 14);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ type: "registry_drift", severity: "high" });
  });

  it("skips deprecated entries", () => {
    const row = knowledgeRow({
      status: "deprecated",
      nextReviewAt: new Date(NOW.getTime() - 30 * DAY_MS),
    });

    expect(buildRegistryFindings([row], NOW, 14)).toHaveLength(0);
  });
});

describe("buildContentFindings", () => {
  const pages: ContentPage[] = [
    {
      pageId: "fresh",
      pageTitle: "Fresh page",
      updatedAt: new Date(NOW.getTime() - 5 * DAY_MS),
    },
    {
      pageId: "stale",
      pageTitle: "Stale page",
      updatedAt: new Date(NOW.getTime() - 200 * DAY_MS),
    },
    {
      pageId: "empty",
      pageTitle: "Empty page",
      updatedAt: new Date(NOW.getTime() - 5 * DAY_MS),
    },
    {
      pageId: "stale-empty",
      pageTitle: "Stale and empty page",
      updatedAt: new Date(NOW.getTime() - 400 * DAY_MS),
    },
  ];

  it("reports stale pages and empty pages separately", () => {
    // Only non-empty pages have snippets
    const snippetPageIds = new Set(["fresh", "stale"]);

    const findings = buildContentFindings(pages, snippetPageIds, NOW, 180);

    expect(findings).toHaveLength(3);
    const byType = Object.fromEntries(findings.map((f) => [f.pageId, f.type]));
    expect(byType).toEqual({
      stale: "stale_page",
      empty: "empty_page",
      // Empty takes precedence — no content to go stale
      "stale-empty": "empty_page",
    });
    const stale = findings.find((f) => f.pageId === "stale");
    expect(stale?.severity).toBe("medium");
    expect(stale?.detail).toContain("200 day(s)");
  });

  it("returns no findings when everything is healthy", () => {
    const healthy: ContentPage[] = [
      {
        pageId: "fresh",
        pageTitle: "Fresh page",
        updatedAt: new Date(NOW.getTime() - 5 * DAY_MS),
      },
    ];

    expect(buildContentFindings(healthy, new Set(["fresh"]), NOW, 180)).toHaveLength(0);
  });
});
