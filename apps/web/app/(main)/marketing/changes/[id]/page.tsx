"use client";

import {
  MARKETING_POST_REVIEW_TYPES,
  type MarketingChangeAction,
  type MarketingChangeRequestDto,
} from "@echolore/shared/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChangeForm, toChangeForm } from "@/components/marketing/ChangeForm";
import { CHANGE_STATUS_TONE } from "@/components/marketing/ops-widgets";
import {
  Button,
  Card,
  ExternalLink,
  Field,
  inputClass,
  Notice,
  Pill,
  splitList,
  useAction,
  WikiLink,
} from "@/components/marketing/ui";
import { ErrorBanner } from "@/components/ui";
import { marketingApi, queryKeys } from "@/lib/api";
import { useAuthContext } from "@/lib/auth-context";
import { useMarketingAccess } from "@/lib/hooks/use-marketing-access";
import { useFormatters, useT } from "@/lib/i18n";

/** Mirrors the server's workflow rules so only meaningful actions are offered. */
function availableActions(
  change: MarketingChangeRequestDto,
  userId: string | undefined,
  can: (p: "marketing.operate" | "marketing.review") => boolean
): MarketingChangeAction[] {
  const s = change.status;
  const postReview = MARKETING_POST_REVIEW_TYPES.includes(change.type);
  const self = change.requestedByUserId === userId;
  const out: MarketingChangeAction[] = [];
  if (can("marketing.operate")) {
    if (s === "open" || s === "rejected") out.push("submit");
    if (s === "approved" || (postReview && (s === "open" || s === "in_review")))
      out.push("implement");
    if (s === "implemented") out.push("verify");
    if (s === "verified" && change.approvedAt) out.push("close");
    if (s === "rejected" || s === "closed") out.push("reopen");
  }
  if (can("marketing.review") && !self) {
    if (s === "in_review") out.push("approve", "reject");
    else if (postReview && (s === "implemented" || s === "verified") && !change.approvedAt)
      out.push("approve");
  }
  return out;
}

export default function MarketingChangeDetailPage() {
  const t = useT();
  const { dateTime } = useFormatters();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const { can } = useMarketingAccess();
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState("");
  const [evidence, setEvidence] = useState("");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...queryKeys.marketing, "changes", "detail", id],
    queryFn: () => marketingApi.getChange(id),
  });

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-white" />;
  if (error || !data)
    return (
      <ErrorBanner message={t("marketing.common.loadFailed")} onRetry={() => void refetch()} />
    );
  const { change, events } = data;
  const actions = availableActions(change, user?.id, can);
  const canEdit =
    (change.status === "open" || change.status === "rejected") &&
    (change.requestedByUserId === user?.id || can("marketing.operate"));
  const hasDetails = [
    change.purpose,
    change.beforeState,
    change.afterState,
    change.impact,
    change.rollbackPlan,
    change.scheduledAt,
    change.verificationNote,
    change.wikiPageId,
    change.evidenceUrls.length > 0,
  ].some(Boolean);
  const isSelfInReview = change.status === "in_review" && change.requestedByUserId === user?.id;

  const transition = (a: MarketingChangeAction) =>
    action.run(async () => {
      await marketingApi.transitionChange(change.id, {
        action: a,
        comment: a === "verify" ? null : comment || null,
        verificationNote: a === "verify" ? comment : null,
        evidenceUrls: a === "verify" && evidence.trim() ? splitList(evidence) : undefined,
      });
      setComment("");
      setEvidence("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.marketing });
    });

  const field = (label: string, value: React.ReactNode) =>
    value ? (
      <div>
        <dt className="text-xs font-medium text-gray-500">{label}</dt>
        <dd className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900">{value}</dd>
      </div>
    ) : null;

  return (
    <div>
      <Link href="/marketing/changes" className="text-sm text-blue-600 hover:underline">
        ← {t("marketing.changes.backToList")}
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{change.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <Pill tone={CHANGE_STATUS_TONE[change.status]}>
              {t(`marketing.changeStatus.${change.status}`)}
            </Pill>
            <span>{t(`marketing.changeTypes.${change.type}`)}</span>
            {change.severity ? <span>· {t(`marketing.severity.${change.severity}`)}</span> : null}
            {change.assetName ? (
              <Link
                href={`/marketing/assets?asset=${change.assetId}`}
                className="text-blue-600 hover:underline"
              >
                · {change.assetName}
              </Link>
            ) : null}
          </div>
        </div>
        {canEdit ? (
          <Button onClick={() => setEditing(true)}>{t("marketing.common.edit")}</Button>
        ) : null}
      </div>

      {change.postReviewOverdue ? (
        <div className="mb-4">
          <Notice tone="danger">{t("marketing.changes.postReviewOverdueNotice")}</Notice>
        </div>
      ) : change.postReviewDueAt && !change.approvedAt ? (
        <div className="mb-4">
          <Notice tone="warning">
            {t("marketing.changes.postReviewDue", { at: dateTime(change.postReviewDueAt) })}
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t("marketing.changes.details")}>
            {!hasDetails ? <p className="text-sm text-gray-500">—</p> : null}
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                {field(t("marketing.changes.fields.purpose"), change.purpose)}
              </div>
              {field(t("marketing.changes.fields.beforeState"), change.beforeState)}
              {field(t("marketing.changes.fields.afterState"), change.afterState)}
              {field(t("marketing.changes.fields.impact"), change.impact)}
              {field(t("marketing.changes.fields.rollbackPlan"), change.rollbackPlan)}
              {field(
                t("marketing.changes.fields.scheduledAt"),
                change.scheduledAt ? dateTime(change.scheduledAt) : null
              )}
              {field(t("marketing.changes.fields.verificationNote"), change.verificationNote)}
              {change.evidenceUrls.length ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-gray-500">
                    {t("marketing.changes.fields.evidenceUrls")}
                  </dt>
                  <dd className="mt-0.5 space-y-0.5">
                    {change.evidenceUrls.map((u) => (
                      <div key={u}>
                        <ExternalLink href={u}>{u}</ExternalLink>
                      </div>
                    ))}
                  </dd>
                </div>
              ) : null}
              {change.wikiPageId ? (
                <div>
                  <WikiLink
                    pageId={change.wikiPageId}
                    label={t("marketing.changes.fields.wikiPage")}
                  />
                </div>
              ) : null}
            </dl>
          </Card>

          <Card title={t("marketing.changes.timeline")}>
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gray-300" />
                  <div className="min-w-0">
                    <p className="text-gray-900">
                      <span className="font-medium">{e.actorName ?? "—"}</span> ·{" "}
                      {t(`marketing.changeActions.${e.action}`)}
                      {e.toStatus && e.fromStatus !== e.toStatus ? (
                        <span className="text-gray-500">
                          {" "}
                          → {t(`marketing.changeStatus.${e.toStatus}`)}
                        </span>
                      ) : null}
                    </p>
                    {e.comment ? (
                      <p className="mt-0.5 whitespace-pre-wrap text-gray-700">{e.comment}</p>
                    ) : null}
                    <p className="text-xs text-gray-500">{dateTime(e.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t("marketing.changes.people")}>
            <dl className="space-y-2 text-sm">
              {[
                ["requestedBy", change.requestedByName, change.createdAt],
                ["approvedBy", change.approvedByName, change.approvedAt],
                ["implementedBy", change.implementedByName, change.implementedAt],
                ["verifiedBy", change.verifiedByName, change.verifiedAt],
              ].map(([key, name, at]) => (
                <div key={key as string} className="flex justify-between gap-2">
                  <dt className="text-gray-500">{t(`marketing.changes.fields.${key}`)}</dt>
                  <dd className="text-right text-gray-900">
                    {name ?? "—"}
                    {at ? (
                      <span className="block text-xs text-gray-500">{dateTime(at as string)}</span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title={t("marketing.changes.actions")}>
            {action.error ? <ErrorBanner message={action.error} className="mb-3" /> : null}
            {isSelfInReview ? (
              <p className="mb-3 text-xs text-gray-500">
                {t("marketing.changes.selfApprovalNote")}
              </p>
            ) : null}
            <Field
              label={
                actions.includes("verify")
                  ? t("marketing.changes.verificationLabel")
                  : t("marketing.changes.commentLabel")
              }
            >
              <textarea
                className={inputClass}
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>
            {actions.includes("verify") ? (
              <div className="mt-2">
                <Field
                  label={t("marketing.changes.fields.evidenceUrls")}
                  hint={t("marketing.changes.evidenceHint")}
                >
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                  />
                </Field>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button
                  key={a}
                  variant={a === "reject" ? "danger" : a === "comment" ? "secondary" : "primary"}
                  disabled={
                    action.pending || ((a === "reject" || a === "verify") && !comment.trim())
                  }
                  onClick={() => void transition(a)}
                >
                  {t(`marketing.changeActions.${a}`)}
                </Button>
              ))}
              <Button
                disabled={action.pending || !comment.trim()}
                onClick={() => void transition("comment")}
              >
                {t("marketing.changeActions.comment")}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {editing ? (
        <ChangeForm
          changeId={change.id}
          initial={toChangeForm(change)}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void queryClient.invalidateQueries({ queryKey: queryKeys.marketing });
          }}
        />
      ) : null}
    </div>
  );
}
