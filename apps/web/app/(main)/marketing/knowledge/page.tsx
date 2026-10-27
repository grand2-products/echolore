"use client";

import {
  MARKETING_DOC_TYPES,
  MARKETING_KNOWLEDGE_LAYERS,
  type MarketingKnowledgePageDto,
  type UpsertMarketingKnowledgePageRequest,
} from "@echolore/shared/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { DOC_STATUS_TONE } from "@/components/marketing/ops-widgets";
import {
  Button,
  Card,
  EmptyState,
  Field,
  inputClass,
  loadingPanelClass,
  Modal,
  PageHeader,
  Pill,
  StatusDot,
  UserSelect,
  useAction,
  useMarketingMembers,
  WikiPageSelect,
} from "@/components/marketing/ui";
import { ErrorBanner } from "@/components/ui";
import { marketingApi, queryKeys, useSpacesQuery } from "@/lib/api";
import { useAuthContext } from "@/lib/auth-context";
import { useMarketingAccess } from "@/lib/hooks/use-marketing-access";
import { useFormatters, useT } from "@/lib/i18n";

function BootstrapCard({ onDone }: { onDone: () => void }) {
  const t = useT();
  const action = useAction();
  const spaces = useSpacesQuery();
  const teamSpaces = (spaces.data?.spaces ?? []).filter((s) => s.type === "team" && s.groupId);
  const [groupId, setGroupId] = useState("");
  return (
    <Card title={t("marketing.knowledge.bootstrapTitle")} className="mb-5">
      <p className="text-sm text-gray-600">{t("marketing.knowledge.bootstrapDescription")}</p>
      {action.error ? <ErrorBanner message={action.error} className="mt-3" /> : null}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[240px]">
          <Field
            label={t("marketing.knowledge.bootstrapSpace")}
            hint={t("marketing.knowledge.bootstrapSpaceHint")}
          >
            <select
              className={inputClass}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">{t("marketing.knowledge.generalSpace")}</option>
              {teamSpaces.map((s) => (
                <option key={s.id} value={s.groupId ?? ""}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button
          variant="primary"
          disabled={action.pending}
          onClick={() =>
            void action.run(async () => {
              await marketingApi.bootstrapKnowledge({ groupId: groupId || null });
              onDone();
            })
          }
        >
          {t("marketing.knowledge.bootstrap")}
        </Button>
      </div>
    </Card>
  );
}

function RegisterModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: MarketingKnowledgePageDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const action = useAction();
  const members = useMarketingMembers();
  const [form, setForm] = useState<UpsertMarketingKnowledgePageRequest>(() =>
    existing
      ? {
          pageId: existing.pageId,
          layer: existing.layer,
          docType: existing.docType,
          purpose: existing.purpose,
          scope: existing.scope,
          ownerUserId: existing.ownerUserId,
          deputyUserId: existing.deputyUserId,
          reviewIntervalDays: existing.reviewIntervalDays,
          notes: existing.notes,
        }
      : { pageId: "", layer: "procedure", docType: "procedure", reviewIntervalDays: 90 }
  );
  const set = (patch: Partial<UpsertMarketingKnowledgePageRequest>) =>
    setForm((f) => ({ ...f, ...patch }));
  const submit = () =>
    action.run(async () => {
      if (existing) {
        const { pageId: _pageId, ...rest } = form;
        await marketingApi.updateKnowledge(existing.id, rest);
      } else {
        await marketingApi.registerKnowledge(form);
      }
      onSaved();
    });

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={existing ? t("marketing.knowledge.editTitle") : t("marketing.knowledge.registerTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("marketing.common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={action.pending || !form.pageId}
          >
            {t("marketing.common.save")}
          </Button>
        </>
      }
    >
      {action.error ? <ErrorBanner message={action.error} className="mb-3" /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {!existing ? (
          <div className="sm:col-span-2">
            <Field label={t("marketing.knowledge.fields.page")} required>
              <WikiPageSelect value={form.pageId} onChange={(v) => set({ pageId: v ?? "" })} />
            </Field>
          </div>
        ) : null}
        <Field label={t("marketing.knowledge.fields.layer")} required>
          <select
            className={inputClass}
            value={form.layer}
            onChange={(e) =>
              set({ layer: e.target.value as UpsertMarketingKnowledgePageRequest["layer"] })
            }
          >
            {MARKETING_KNOWLEDGE_LAYERS.map((l) => (
              <option key={l} value={l}>
                {t(`marketing.layers.${l}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("marketing.knowledge.fields.docType")}>
          <select
            className={inputClass}
            value={form.docType}
            onChange={(e) =>
              set({ docType: e.target.value as UpsertMarketingKnowledgePageRequest["docType"] })
            }
          >
            {MARKETING_DOC_TYPES.map((d) => (
              <option key={d} value={d}>
                {t(`marketing.docTypes.${d}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("marketing.knowledge.fields.owner")}>
          <UserSelect
            value={form.ownerUserId}
            members={members.data}
            onChange={(v) => set({ ownerUserId: v })}
          />
        </Field>
        <Field label={t("marketing.knowledge.fields.deputy")}>
          <UserSelect
            value={form.deputyUserId}
            members={members.data}
            onChange={(v) => set({ deputyUserId: v })}
          />
        </Field>
        <Field
          label={t("marketing.knowledge.fields.reviewIntervalDays")}
          hint={t("marketing.knowledge.intervalHint")}
        >
          <input
            type="number"
            min={7}
            max={730}
            className={inputClass}
            value={form.reviewIntervalDays ?? 90}
            onChange={(e) => set({ reviewIntervalDays: Number(e.target.value) || 90 })}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("marketing.knowledge.fields.purpose")}>
            <input
              className={inputClass}
              value={form.purpose ?? ""}
              maxLength={2000}
              onChange={(e) => set({ purpose: e.target.value || null })}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("marketing.knowledge.fields.scope")}>
            <input
              className={inputClass}
              value={form.scope ?? ""}
              maxLength={2000}
              onChange={(e) => set({ scope: e.target.value || null })}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("marketing.knowledge.fields.notes")}>
            <textarea
              className={inputClass}
              rows={2}
              value={form.notes ?? ""}
              maxLength={5000}
              onChange={(e) => set({ notes: e.target.value || null })}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function DeprecateModal({
  page,
  onClose,
  onSaved,
}: {
  page: MarketingKnowledgePageDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const action = useAction();
  const [replacement, setReplacement] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={t("marketing.knowledge.deprecateTitle", { title: page.pageTitle ?? "" })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("marketing.common.cancel")}
          </Button>
          <Button
            variant="danger"
            disabled={action.pending}
            onClick={() =>
              void action.run(async () => {
                await marketingApi.deprecateKnowledge(page.id, {
                  replacedByPageId: replacement,
                  reason: reason || null,
                });
                onSaved();
              })
            }
          >
            {t("marketing.knowledge.deprecate")}
          </Button>
        </>
      }
    >
      {action.error ? <ErrorBanner message={action.error} className="mb-3" /> : null}
      <div className="space-y-3">
        <Field
          label={t("marketing.knowledge.replacement")}
          hint={t("marketing.knowledge.replacementHint")}
        >
          <WikiPageSelect value={replacement} onChange={setReplacement} />
        </Field>
        <Field label={t("marketing.knowledge.reason")}>
          <input
            className={inputClass}
            value={reason}
            maxLength={2000}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

export default function MarketingKnowledgePage() {
  const t = useT();
  const { date } = useFormatters();
  const queryClient = useQueryClient();
  const { can } = useMarketingAccess();
  const { user } = useAuthContext();
  const action = useAction();
  const [registering, setRegistering] = useState<{
    existing: MarketingKnowledgePageDto | null;
  } | null>(null);
  const [deprecating, setDeprecating] = useState<MarketingKnowledgePageDto | null>(null);
  const settings = useQuery({
    queryKey: [...queryKeys.marketing, "settings"],
    queryFn: () => marketingApi.getSettings(),
  });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...queryKeys.marketing, "knowledge"],
    queryFn: () => marketingApi.listKnowledge(),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.marketing });
  const run = (fn: () => Promise<unknown>) =>
    action.run(async () => {
      await fn();
      await refresh();
    });

  const byLayer = MARKETING_KNOWLEDGE_LAYERS.map((layer) => ({
    layer,
    pages: (data ?? []).filter((k) => k.layer === layer),
  }));

  return (
    <div>
      <PageHeader
        actions={
          <>
            {settings.data?.knowledgeRootPageId ? (
              <Link
                href={`/wiki/${settings.data.knowledgeRootPageId}`}
                className="text-sm text-blue-600 hover:underline"
              >
                {t("marketing.knowledge.openRoot")}
              </Link>
            ) : null}
            {can("marketing.operate") ? (
              <Button variant="primary" onClick={() => setRegistering({ existing: null })}>
                + {t("marketing.knowledge.register")}
              </Button>
            ) : null}
          </>
        }
      />
      {settings.data && !settings.data.knowledgeRootPageId && can("marketing.manage") ? (
        <BootstrapCard onDone={() => void refresh()} />
      ) : null}
      {action.error ? <ErrorBanner message={action.error} className="mb-4" /> : null}
      {error ? (
        <ErrorBanner message={t("marketing.common.loadFailed")} onRetry={() => void refetch()} />
      ) : null}
      {isLoading ? (
        <div className={`h-32 ${loadingPanelClass}`} />
      ) : !data?.length ? (
        <EmptyState
          title={t("marketing.knowledge.empty")}
          description={t("marketing.knowledge.emptyDescription")}
        />
      ) : (
        <div className="space-y-4">
          {byLayer.map(({ layer, pages }) => (
            <Card
              key={layer}
              flush
              title={t(`marketing.layers.${layer}`)}
              actions={
                <span className="text-xs text-gray-500">{t(`marketing.layerOwners.${layer}`)}</span>
              }
            >
              {pages.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-500">—</p>
              ) : (
                <div className="overflow-x-auto px-3">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500">
                      <tr className="border-b border-gray-100 text-left">
                        <th className="py-1.5 font-medium">
                          {t("marketing.knowledge.fields.page")}
                        </th>
                        <th className="py-1.5 font-medium">
                          {t("marketing.knowledge.fields.status")}
                        </th>
                        <th className="py-1.5 font-medium">
                          {t("marketing.knowledge.fields.owner")}
                        </th>
                        <th className="py-1.5 font-medium">
                          {t("marketing.knowledge.nextReview")}
                        </th>
                        <th className="py-1.5 font-medium">
                          {t("marketing.knowledge.fields.approvedBy")}
                        </th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {pages.map((k) => (
                        <tr key={k.id} className="border-b border-gray-50 align-top last:border-0">
                          <td className="py-2 pr-2">
                            <Link
                              href={`/wiki/${k.pageId}`}
                              className="font-medium text-gray-900 hover:underline"
                            >
                              {k.pageTitle ?? "—"}
                            </Link>
                            <span className="ml-1.5 text-xs text-gray-500">
                              {t(`marketing.docTypes.${k.docType}`)}
                            </span>
                            {k.pageMissing ? (
                              <span className="ml-1.5">
                                <Pill tone="red">{t("marketing.knowledge.pageMissing")}</Pill>
                              </span>
                            ) : null}
                            {k.replacedByPageId ? (
                              <span className="block text-xs text-gray-500">
                                →{" "}
                                <Link
                                  href={`/wiki/${k.replacedByPageId}`}
                                  className="text-blue-600 hover:underline"
                                >
                                  {k.replacedByPageTitle ?? k.replacedByPageId}
                                </Link>
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2">
                            <Pill tone={DOC_STATUS_TONE[k.status]}>
                              {t(`marketing.docStatus.${k.status}`)}
                            </Pill>
                            {k.changedSinceApproval ? (
                              <span className="mt-1 block">
                                <Pill tone="amber">
                                  {t("marketing.knowledge.changedSinceApproval")}
                                </Pill>
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2 text-xs">
                            {k.ownerName ?? (
                              <span className="inline-flex items-center gap-1.5 text-amber-800">
                                <StatusDot />
                                {t("marketing.common.unassigned")}
                              </span>
                            )}
                            <span className="block text-gray-500">
                              {t("marketing.knowledge.fields.deputy")}: {k.deputyName ?? "—"}
                            </span>
                          </td>
                          <td
                            className={`py-2 pr-2 text-xs ${k.reviewOverdue ? "text-red-700" : "text-gray-700"}`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {k.reviewOverdue ? <StatusDot tone="red" /> : null}
                              {k.nextReviewAt ? date(k.nextReviewAt) : "—"}
                            </span>
                            <span className="block text-gray-500">
                              {t("marketing.knowledge.everyDays", { days: k.reviewIntervalDays })}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-xs">
                            {k.approvedByName ?? "—"}
                            {k.approvedAt ? (
                              <span className="block text-gray-500">{date(k.approvedAt)}</span>
                            ) : null}
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              {can("marketing.review") &&
                              k.ownerUserId !== user?.id &&
                              k.status !== "deprecated" &&
                              (k.status !== "approved" || k.changedSinceApproval) ? (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={action.pending}
                                  onClick={() =>
                                    void run(() => marketingApi.approveKnowledge(k.id))
                                  }
                                >
                                  {t("marketing.knowledge.approve")}
                                </Button>
                              ) : null}
                              {can("marketing.operate") && k.status !== "deprecated" ? (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={action.pending}
                                    onClick={() =>
                                      void run(() => marketingApi.reviewKnowledge(k.id))
                                    }
                                  >
                                    {t("marketing.knowledge.markReviewed")}
                                  </Button>
                                  <Button size="sm" onClick={() => setRegistering({ existing: k })}>
                                    {t("marketing.common.edit")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDeprecating(k)}
                                  >
                                    {t("marketing.knowledge.deprecate")}
                                  </Button>
                                </>
                              ) : null}
                              {can("marketing.manage") ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600"
                                  disabled={action.pending}
                                  onClick={() =>
                                    void run(() => marketingApi.unregisterKnowledge(k.id))
                                  }
                                >
                                  {t("marketing.knowledge.unregister")}
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {registering ? (
        <RegisterModal
          existing={registering.existing}
          onClose={() => setRegistering(null)}
          onSaved={() => {
            setRegistering(null);
            void refresh();
          }}
        />
      ) : null}
      {deprecating ? (
        <DeprecateModal
          page={deprecating}
          onClose={() => setDeprecating(null)}
          onSaved={() => {
            setDeprecating(null);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
