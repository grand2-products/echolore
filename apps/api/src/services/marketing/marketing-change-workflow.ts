import {
  MARKETING_POST_REVIEW_TYPES,
  type MarketingChangeAction,
  type MarketingChangeStatus,
  type MarketingChangeType,
  MarketingPermission,
} from "@echolore/shared/contracts";
import type { MarketingChangeRequest } from "../../db/schema.js";
import { isSelfApproval } from "../../policies/marketing-policy.js";
import { nextBusinessDay } from "./marketing-dates.js";

/**
 * Common change flow: Issue → 変更提案 → レビュー → 承認 → 実施 → 検証 → 完了.
 *
 *   open ──submit──▶ in_review ──approve──▶ approved ──implement──▶ implemented
 *     ▲                 │reject                                         │verify
 *     └──reopen── rejected                    closed ◀──close── verified
 *
 * Emergency / incident records may be implemented first (影響縮小を優先) and
 * must receive an after-the-fact approval (事後レビュー, due next business
 * day) before they can be closed. Approvers can never approve their own
 * request.
 */

export type TransitionPlan =
  | {
      ok: true;
      toStatus: MarketingChangeStatus;
      patch: Partial<MarketingChangeRequest>;
    }
  | { ok: false; httpStatus: 400 | 403 | 409; code: string; message: string };

export interface TransitionInput {
  comment?: string | null;
  verificationNote?: string | null;
  evidenceUrls?: string[];
}

const deny = (httpStatus: 400 | 403 | 409, code: string, message: string): TransitionPlan => ({
  ok: false,
  httpStatus,
  code,
  message,
});

const REQUIRED_PERMISSION: Record<MarketingChangeAction, MarketingPermission> = {
  submit: MarketingPermission.Operate,
  approve: MarketingPermission.Review,
  reject: MarketingPermission.Review,
  implement: MarketingPermission.Operate,
  verify: MarketingPermission.Operate,
  close: MarketingPermission.Operate,
  reopen: MarketingPermission.Operate,
  comment: MarketingPermission.View,
};

export function requiresPostReview(type: string): boolean {
  return MARKETING_POST_REVIEW_TYPES.includes(type as MarketingChangeType);
}

export function planChangeTransition(
  change: MarketingChangeRequest,
  action: MarketingChangeAction,
  actor: { id: string; permissions: MarketingPermission[] },
  input: TransitionInput,
  now = new Date()
): TransitionPlan {
  if (!actor.permissions.includes(REQUIRED_PERMISSION[action])) {
    return deny(
      403,
      "MARKETING_FORBIDDEN",
      `Action '${action}' requires ${REQUIRED_PERMISSION[action]}`
    );
  }
  const status = change.status as MarketingChangeStatus;
  const postReview = requiresPostReview(change.type);
  const invalid = () =>
    deny(409, "MARKETING_INVALID_TRANSITION", `Cannot ${action} a change in status '${status}'`);

  switch (action) {
    case "comment":
      if (!input.comment?.trim())
        return deny(400, "MARKETING_COMMENT_REQUIRED", "Comment is required");
      return { ok: true, toStatus: status, patch: {} };

    case "submit":
      if (status !== "open" && status !== "rejected") return invalid();
      return { ok: true, toStatus: "in_review", patch: { status: "in_review" } };

    case "approve": {
      if (isSelfApproval(actor.id, [change.requestedByUserId])) {
        return deny(403, "MARKETING_SELF_APPROVAL", "You cannot approve your own request");
      }
      const approval = { approvedByUserId: actor.id, approvedAt: now };
      if (status === "in_review") {
        return { ok: true, toStatus: "approved", patch: { status: "approved", ...approval } };
      }
      // Post-review of an emergency / incident that was already handled.
      if (postReview && (status === "implemented" || status === "verified") && !change.approvedAt) {
        return { ok: true, toStatus: status, patch: approval };
      }
      return invalid();
    }

    case "reject":
      if (isSelfApproval(actor.id, [change.requestedByUserId])) {
        return deny(403, "MARKETING_SELF_APPROVAL", "You cannot review your own request");
      }
      if (status !== "in_review") return invalid();
      if (!input.comment?.trim()) {
        return deny(400, "MARKETING_COMMENT_REQUIRED", "A reason is required to reject");
      }
      return { ok: true, toStatus: "rejected", patch: { status: "rejected" } };

    case "implement": {
      const implemented = {
        status: "implemented",
        implementedByUserId: actor.id,
        implementedAt: now,
      };
      if (status === "approved") return { ok: true, toStatus: "implemented", patch: implemented };
      if (postReview && (status === "open" || status === "in_review")) {
        return {
          ok: true,
          toStatus: "implemented",
          patch: { ...implemented, postReviewDueAt: nextBusinessDay(now) },
        };
      }
      return invalid();
    }

    case "verify":
      if (status !== "implemented") return invalid();
      if (!input.verificationNote?.trim()) {
        return deny(400, "MARKETING_VERIFICATION_REQUIRED", "Verification result is required");
      }
      return {
        ok: true,
        toStatus: "verified",
        patch: {
          status: "verified",
          verifiedByUserId: actor.id,
          verifiedAt: now,
          verificationNote: input.verificationNote.trim(),
          ...(input.evidenceUrls ? { evidenceUrls: input.evidenceUrls } : {}),
        },
      };

    case "close":
      if (status !== "verified") return invalid();
      if (!change.approvedAt) {
        return deny(
          409,
          "MARKETING_POST_REVIEW_REQUIRED",
          "Approval (post-review) is required before closing"
        );
      }
      return { ok: true, toStatus: "closed", patch: { status: "closed" } };

    case "reopen":
      if (status !== "rejected" && status !== "closed") return invalid();
      return {
        ok: true,
        toStatus: "open",
        patch: {
          status: "open",
          approvedByUserId: null,
          approvedAt: null,
          implementedByUserId: null,
          implementedAt: null,
          verifiedByUserId: null,
          verifiedAt: null,
          verificationNote: null,
          postReviewDueAt: null,
        },
      };
  }
}

export function isPostReviewOverdue(change: MarketingChangeRequest, now = new Date()): boolean {
  return Boolean(
    change.postReviewDueAt &&
      change.postReviewDueAt < now &&
      !change.approvedAt &&
      change.status !== "closed"
  );
}
