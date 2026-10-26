import { MarketingPermission } from "@echolore/shared/contracts";
import { describe, expect, it } from "vitest";
import type { MarketingChangeRequest } from "../../db/schema.js";
import { isPostReviewOverdue, planChangeTransition } from "./marketing-change-workflow.js";

const ALL = Object.values(MarketingPermission);
const OPERATOR = [MarketingPermission.View, MarketingPermission.Operate];
const REVIEWER = [MarketingPermission.View, MarketingPermission.Review];

function change(overrides: Partial<MarketingChangeRequest> = {}): MarketingChangeRequest {
  const now = new Date("2026-10-26T09:00:00Z");
  return {
    id: "mkch_1",
    type: "budget_change",
    title: "Increase budget",
    purpose: null,
    assetId: null,
    severity: null,
    beforeState: null,
    afterState: null,
    impact: null,
    rollbackPlan: null,
    scheduledAt: null,
    status: "open",
    requestedByUserId: "requester",
    approvedByUserId: null,
    approvedAt: null,
    implementedByUserId: null,
    implementedAt: null,
    verifiedByUserId: null,
    verifiedAt: null,
    verificationNote: null,
    evidenceUrls: [],
    wikiPageId: null,
    postReviewDueAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("planChangeTransition", () => {
  it("walks the standard flow open → in_review → approved → implemented → verified → closed", () => {
    let current = change();
    const steps: Array<[Parameters<typeof planChangeTransition>[1], string, string[]]> = [
      ["submit", "requester", OPERATOR],
      ["approve", "reviewer", REVIEWER],
      ["implement", "operator", OPERATOR],
      ["verify", "operator", OPERATOR],
      ["close", "operator", OPERATOR],
    ];
    const statuses: string[] = [];
    for (const [action, actorId, permissions] of steps) {
      const plan = planChangeTransition(
        current,
        action,
        { id: actorId, permissions: permissions as MarketingPermission[] },
        { verificationNote: "Checked in Ads Manager" }
      );
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      current = { ...current, ...plan.patch, status: plan.toStatus };
      statuses.push(current.status);
    }
    expect(statuses).toEqual(["in_review", "approved", "implemented", "verified", "closed"]);
    expect(current.approvedByUserId).toBe("reviewer");
  });

  it("forbids approving one's own request even with every permission", () => {
    const plan = planChangeTransition(
      change({ status: "in_review" }),
      "approve",
      { id: "requester", permissions: ALL },
      {}
    );
    expect(plan).toMatchObject({ ok: false, httpStatus: 403, code: "MARKETING_SELF_APPROVAL" });
  });

  it("requires marketing.review to approve", () => {
    const plan = planChangeTransition(
      change({ status: "in_review" }),
      "approve",
      { id: "operator", permissions: OPERATOR },
      {}
    );
    expect(plan).toMatchObject({ ok: false, httpStatus: 403 });
  });

  it("does not allow implementing a normal change before approval", () => {
    const plan = planChangeTransition(
      change({ status: "in_review" }),
      "implement",
      { id: "operator", permissions: OPERATOR },
      {}
    );
    expect(plan).toMatchObject({ ok: false, httpStatus: 409 });
  });

  it("lets emergencies be implemented first and blocks closing until post-review", () => {
    const now = new Date("2026-10-30T10:00:00Z"); // Friday
    const implement = planChangeTransition(
      change({ type: "emergency" }),
      "implement",
      { id: "operator", permissions: OPERATOR },
      {},
      now
    );
    expect(implement.ok).toBe(true);
    if (!implement.ok) return;
    // Next business day after Friday is Monday.
    expect(implement.patch.postReviewDueAt?.toISOString()).toBe("2026-11-02T10:00:00.000Z");

    const verified = change({
      type: "emergency",
      status: "verified",
      postReviewDueAt: implement.patch.postReviewDueAt ?? null,
    });
    const close = planChangeTransition(
      verified,
      "close",
      { id: "operator", permissions: OPERATOR },
      {}
    );
    expect(close).toMatchObject({ ok: false, code: "MARKETING_POST_REVIEW_REQUIRED" });

    const postReview = planChangeTransition(
      verified,
      "approve",
      { id: "reviewer", permissions: REVIEWER },
      {}
    );
    expect(postReview).toMatchObject({ ok: true, toStatus: "verified" });
  });

  it("requires a verification note and a rejection reason", () => {
    expect(
      planChangeTransition(
        change({ status: "implemented" }),
        "verify",
        { id: "operator", permissions: OPERATOR },
        {}
      )
    ).toMatchObject({ ok: false, code: "MARKETING_VERIFICATION_REQUIRED" });
    expect(
      planChangeTransition(
        change({ status: "in_review" }),
        "reject",
        { id: "reviewer", permissions: REVIEWER },
        {}
      )
    ).toMatchObject({ ok: false, code: "MARKETING_COMMENT_REQUIRED" });
  });

  it("clears approval data on reopen", () => {
    const plan = planChangeTransition(
      change({ status: "closed", approvedAt: new Date(), approvedByUserId: "reviewer" }),
      "reopen",
      { id: "operator", permissions: OPERATOR },
      {}
    );
    expect(plan).toMatchObject({
      ok: true,
      toStatus: "open",
      patch: { approvedAt: null, approvedByUserId: null },
    });
  });

  it("flags overdue post-reviews", () => {
    const now = new Date("2026-11-03T00:00:00Z");
    expect(
      isPostReviewOverdue(
        change({ status: "implemented", postReviewDueAt: new Date("2026-11-02T00:00:00Z") }),
        now
      )
    ).toBe(true);
    expect(
      isPostReviewOverdue(
        change({
          status: "implemented",
          postReviewDueAt: new Date("2026-11-02T00:00:00Z"),
          approvedAt: new Date("2026-11-01T00:00:00Z"),
        }),
        now
      )
    ).toBe(false);
  });
});
