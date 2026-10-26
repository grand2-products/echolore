"use client";

import {
  type CreateMarketingAssetAccessRequest,
  MARKETING_ACCESS_ROLES,
  MARKETING_ASSET_STATUSES,
  MARKETING_ASSET_TYPES,
  MARKETING_PRINCIPAL_TYPES,
  type MarketingAssetDto,
  type UpsertMarketingAssetRequest,
} from "@echolore/shared/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Button,
  EmptyState,
  ExternalLink,
  Field,
  inputClass,
  Modal,
  Notice,
  PageHeader,
  Pill,
  splitList,
  UserSelect,
  useAction,
  useMarketingAssets,
  useMarketingMembers,
  WikiLink,
  WikiPageSelect,
} from "@/components/marketing/ui";
import { ErrorBanner } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { marketingApi, queryKeys } from "@/lib/api";
import { useMarketingAccess } from "@/lib/hooks/use-marketing-access";
import { useFormatters, useT } from "@/lib/i18n";

const EMPTY_FORM: UpsertMarketingAssetRequest = {
  type: "meta_ads",
  name: "",
  verificationIntervalDays: 30,
  status: "active",
  relatedAssetIds: [],
  measurementIds: [],
};

function toForm(a: MarketingAssetDto): UpsertMarketingAssetRequest {
  return {
    type: a.type,
    name: a.name,
    externalId: a.externalId,
    purpose: a.purpose,
    ownerEntity: a.ownerEntity,
    billingEntity: a.billingEntity,
    primaryOwnerUserId: a.primaryOwnerUserId,
    secondaryOwnerUserId: a.secondaryOwnerUserId,
    agencyName: a.agencyName,
    agencyRelationship: a.agencyRelationship,
    relatedAssetIds: a.relatedAssetIds,
    measurementIds: a.measurementIds,
    consoleUrl: a.consoleUrl,
    publicUrl: a.publicUrl,
    secretReference: a.secretReference,
    emergencyContact: a.emergencyContact,
    wikiPageId: a.wikiPageId,
    notes: a.notes,
    status: a.status,
    verificationIntervalDays: a.verificationIntervalDays,
  };
}

function AssetForm({
  initial,
  assetId,
  assets,
  onClose,
  onSaved,
}: {
  initial: UpsertMarketingAssetRequest;
  assetId: string | null;
  assets: MarketingAssetDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const members = useMarketingMembers();
  const action = useAction();
  const [form, setForm] = useState(initial);
  const [measurementText, setMeasurementText] = useState((initial.measurementIds ?? []).join(", "));
  const set = (patch: Partial<UpsertMarketingAssetRequest>) => setForm((f) => ({ ...f, ...patch }));
  const text = (key: keyof UpsertMarketingAssetRequest) => ({
    value: (form[key] as string | null | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set({ [key]: e.target.value || null } as Partial<UpsertMarketingAssetRequest>),
  });

  const submit = () =>
    action.run(async () => {
      const body = { ...form, measurementIds: splitList(measurementText) };
      if (assetId) await marketingApi.updateAsset(assetId, body);
      else await marketingApi.createAsset(body);
      onSaved();
    });

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={assetId ? t("marketing.assets.editTitle") : t("marketing.assets.createTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("marketing.common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={action.pending || !form.name.trim()}
          >
            {t("marketing.common.save")}
          </Button>
        </>
      }
    >
      {action.error ? <ErrorBanner message={action.error} className="mb-3" /> : null}
      <Notice tone="warning">{t("marketing.assets.noSecretsNotice")}</Notice>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={t("marketing.assets.fields.type")} required>
          <select
            className={inputClass}
            value={form.type}
            onChange={(e) => set({ type: e.target.value as UpsertMarketingAssetRequest["type"] })}
          >
            {MARKETING_ASSET_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`marketing.assetTypes.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("marketing.assets.fields.name")} required>
          <input className={inputClass} maxLength={200} {...text("name")} />
        </Field>
        <Field label={t("marketing.assets.fields.externalId")}>
          <input className={inputClass} maxLength={200} {...text("externalId")} />
        </Field>
        <Field label={t("marketing.assets.fields.status")}>
          <select
            className={inputClass}
            value={form.status}
            onChange={(e) =>
              set({ status: e.target.value as UpsertMarketingAssetRequest["status"] })
            }
          >
            {MARKETING_ASSET_STATUSES.map((x) => (
              <option key={x} value={x}>
                {t(`marketing.assetStatus.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("marketing.assets.fields.purpose")}>
            <input className={inputClass} maxLength={2000} {...text("purpose")} />
          </Field>
        </div>
        <Field label={t("marketing.assets.fields.ownerEntity")}>
          <input className={inputClass} maxLength={200} {...text("ownerEntity")} />
        </Field>
        <Field label={t("marketing.assets.fields.billingEntity")}>
          <input className={inputClass} maxLength={200} {...text("billingEntity")} />
        </Field>
        <Field label={t("marketing.assets.primary")}>
          <UserSelect
            value={form.primaryOwnerUserId}
            members={members.data}
            onChange={(v) => set({ primaryOwnerUserId: v })}
          />
        </Field>
        <Field label={t("marketing.assets.secondary")}>
          <UserSelect
            value={form.secondaryOwnerUserId}
            members={members.data}
            onChange={(v) => set({ secondaryOwnerUserId: v })}
          />
        </Field>
        <Field label={t("marketing.assets.fields.agencyName")}>
          <input className={inputClass} maxLength={200} {...text("agencyName")} />
        </Field>
        <Field label={t("marketing.assets.fields.agencyRelationship")}>
          <input className={inputClass} maxLength={2000} {...text("agencyRelationship")} />
        </Field>
        <Field
          label={t("marketing.assets.fields.measurementIds")}
          hint={t("marketing.common.commaSeparated")}
        >
          <input
            className={inputClass}
            value={measurementText}
            onChange={(e) => setMeasurementText(e.target.value)}
          />
        </Field>
        <Field label={t("marketing.assets.fields.verificationIntervalDays")}>
          <input
            type="number"
            min={1}
            max={365}
            className={inputClass}
            value={form.verificationIntervalDays ?? 30}
            onChange={(e) => set({ verificationIntervalDays: Number(e.target.value) || 30 })}
          />
        </Field>
        <Field label={t("marketing.assets.fields.consoleUrl")}>
          <input className={inputClass} type="url" maxLength={1000} {...text("consoleUrl")} />
        </Field>
        <Field label={t("marketing.assets.fields.publicUrl")}>
          <input className={inputClass} type="url" maxLength={1000} {...text("publicUrl")} />
        </Field>
        <Field
          label={t("marketing.assets.fields.secretReference")}
          hint={t("marketing.assets.secretReferenceHint")}
        >
          <input className={inputClass} maxLength={500} {...text("secretReference")} />
        </Field>
        <Field label={t("marketing.assets.fields.emergencyContact")}>
          <input className={inputClass} maxLength={1000} {...text("emergencyContact")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("marketing.assets.fields.relatedAssets")}>
            <div className="flex max-h-28 flex-wrap gap-x-4 gap-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
              {assets
                .filter((a) => a.id !== assetId)
                .map((a) => (
                  <label key={a.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={(form.relatedAssetIds ?? []).includes(a.id)}
                      onChange={(e) =>
                        set({
                          relatedAssetIds: e.target.checked
                            ? [...(form.relatedAssetIds ?? []), a.id]
                            : (form.relatedAssetIds ?? []).filter((x) => x !== a.id),
                        })
                      }
                    />
                    {a.name}
                  </label>
                ))}
            </div>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("marketing.assets.fields.wikiPage")}>
            <WikiPageSelect value={form.wikiPageId} onChange={(v) => set({ wikiPageId: v })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("marketing.assets.fields.notes")}>
            <textarea className={inputClass} rows={3} maxLength={5000} {...text("notes")} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function AccessForm({ assetId, onSaved }: { assetId: string; onSaved: () => void }) {
  const t = useT();
  const action = useAction();
  const [form, setForm] = useState<CreateMarketingAssetAccessRequest>({
    principal: "",
    principalType: "employee",
    role: "viewer",
  });
  const needsExpiry = form.principalType === "agency" || form.principalType === "contractor";
  const submit = () =>
    action.run(async () => {
      await marketingApi.addAssetAccess(assetId, form);
      setForm({ principal: "", principalType: "employee", role: "viewer" });
      onSaved();
    });
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      {action.error ? <ErrorBanner message={action.error} className="mb-2" /> : null}
      <div className="grid gap-2 sm:grid-cols-5">
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder={t("marketing.access.principal")}
          value={form.principal}
          onChange={(e) => setForm({ ...form, principal: e.target.value })}
        />
        <select
          className={inputClass}
          value={form.principalType}
          onChange={(e) =>
            setForm({
              ...form,
              principalType: e.target.value as CreateMarketingAssetAccessRequest["principalType"],
            })
          }
        >
          {MARKETING_PRINCIPAL_TYPES.map((x) => (
            <option key={x} value={x}>
              {t(`marketing.principalTypes.${x}`)}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={form.role}
          onChange={(e) =>
            setForm({ ...form, role: e.target.value as CreateMarketingAssetAccessRequest["role"] })
          }
        >
          {MARKETING_ACCESS_ROLES.map((x) => (
            <option key={x} value={x}>
              {t(`marketing.accessRoles.${x}`)}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={inputClass}
          aria-label={t("marketing.access.expiresAt")}
          value={form.expiresAt ?? ""}
          onChange={(e) => setForm({ ...form, expiresAt: e.target.value || null })}
        />
        <input
          className={`${inputClass} sm:col-span-4`}
          placeholder={t("marketing.access.scope")}
          value={form.scope ?? ""}
          onChange={(e) => setForm({ ...form, scope: e.target.value || null })}
        />
        <Button
          variant="primary"
          onClick={() => void submit()}
          disabled={action.pending || !form.principal.trim() || (needsExpiry && !form.expiresAt)}
        >
          {t("marketing.access.add")}
        </Button>
      </div>
      {needsExpiry ? (
        <p className="mt-1 text-xs text-gray-500">{t("marketing.access.expiryRequired")}</p>
      ) : null}
    </div>
  );
}

function AssetDetail({
  assetId,
  onClose,
  onEdit,
}: {
  assetId: string;
  onClose: () => void;
  onEdit: (asset: MarketingAssetDto) => void;
}) {
  const t = useT();
  const { date, dateTime } = useFormatters();
  const queryClient = useQueryClient();
  const { can } = useMarketingAccess();
  const action = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const detailKey = [...queryKeys.marketing, "assets", assetId];
  const { data, isLoading } = useQuery({
    queryKey: detailKey,
    queryFn: () => marketingApi.getAsset(assetId),
  });
  const changes = useQuery({
    queryKey: [...queryKeys.marketing, "changes", "asset", assetId],
    queryFn: () => marketingApi.listChanges({ assetId }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.marketing });
  const asset = data?.asset;

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[150px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-gray-900">{value || "—"}</dd>
    </div>
  );

  return (
    <Modal open onClose={onClose} wide title={asset?.name ?? t("common.status.loading")}>
      {action.error ? <ErrorBanner message={action.error} className="mb-3" /> : null}
      {isLoading || !asset ? null : (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Pill tone="blue">{t(`marketing.assetTypes.${asset.type}`)}</Pill>
            <Pill tone={asset.status === "active" ? "green" : "gray"}>
              {t(`marketing.assetStatus.${asset.status}`)}
            </Pill>
            {asset.verificationOverdue ? (
              <Pill tone="amber">⚠ {t("marketing.assets.verifyDue")}</Pill>
            ) : null}
            <span className="flex-1" />
            {can("marketing.operate") ? (
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    void action.run(async () => {
                      await marketingApi.verifyAsset(asset.id);
                      await refresh();
                    })
                  }
                  disabled={action.pending}
                >
                  {t("marketing.assets.markVerified")}
                </Button>
                <Button size="sm" onClick={() => onEdit(asset)}>
                  {t("marketing.common.edit")}
                </Button>
              </>
            ) : null}
            {can("marketing.manage") ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={() => setConfirmDelete(true)}
              >
                {t("marketing.common.delete")}
              </Button>
            ) : null}
          </div>
          <dl className="divide-y divide-gray-100">
            {row(t("marketing.assets.fields.externalId"), asset.externalId)}
            {row(t("marketing.assets.fields.purpose"), asset.purpose)}
            {row(t("marketing.assets.fields.ownerEntity"), asset.ownerEntity)}
            {row(t("marketing.assets.fields.billingEntity"), asset.billingEntity)}
            {row(t("marketing.assets.primary"), asset.primaryOwnerName)}
            {row(t("marketing.assets.secondary"), asset.secondaryOwnerName)}
            {row(t("marketing.assets.fields.emergencyContact"), asset.emergencyContact)}
            {row(
              t("marketing.assets.fields.agencyName"),
              [asset.agencyName, asset.agencyRelationship].filter(Boolean).join(" — ")
            )}
            {row(t("marketing.assets.fields.measurementIds"), asset.measurementIds.join(", "))}
            {row(
              t("marketing.assets.fields.consoleUrl"),
              <ExternalLink href={asset.consoleUrl}>{asset.consoleUrl}</ExternalLink>
            )}
            {row(
              t("marketing.assets.fields.publicUrl"),
              <ExternalLink href={asset.publicUrl}>{asset.publicUrl}</ExternalLink>
            )}
            {row(t("marketing.assets.fields.secretReference"), asset.secretReference)}
            {row(t("marketing.assets.fields.wikiPage"), <WikiLink pageId={asset.wikiPageId} />)}
            {row(
              t("marketing.assets.lastVerified"),
              asset.lastVerifiedAt
                ? `${dateTime(asset.lastVerifiedAt)} (${asset.lastVerifiedByName ?? "—"})`
                : t("marketing.common.never")
            )}
            {row(
              t("marketing.assets.fields.notes"),
              <span className="whitespace-pre-wrap">{asset.notes}</span>
            )}
          </dl>

          <h3 className="mt-5 text-sm font-semibold text-gray-900">
            {t("marketing.access.title")}
          </h3>
          <p className="text-xs text-gray-500">{t("marketing.access.description")}</p>
          <table className="mt-2 w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr className="border-b border-gray-100 text-left">
                <th className="py-1.5 font-medium">{t("marketing.access.principal")}</th>
                <th className="py-1.5 font-medium">{t("marketing.access.role")}</th>
                <th className="py-1.5 font-medium">{t("marketing.access.expiresAt")}</th>
                <th className="py-1.5 font-medium">{t("marketing.access.approvedBy")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data?.access ?? []).map((e) => (
                <tr
                  key={e.id}
                  className={`border-b border-gray-50 ${e.revokedAt ? "text-gray-400 line-through" : ""}`}
                >
                  <td className="py-1.5">
                    {e.principal}
                    <span className="ml-1 text-xs text-gray-500">
                      ({t(`marketing.principalTypes.${e.principalType}`)})
                    </span>
                    {e.scope ? (
                      <span className="block text-xs text-gray-500">{e.scope}</span>
                    ) : null}
                  </td>
                  <td className="py-1.5">{t(`marketing.accessRoles.${e.role}`)}</td>
                  <td className="py-1.5">
                    {e.expiresAt ? date(e.expiresAt) : "—"}
                    {e.expired ? <Pill tone="red">{t("marketing.access.expired")}</Pill> : null}
                  </td>
                  <td className="py-1.5">{e.approvedByName ?? "—"}</td>
                  <td className="py-1.5 text-right">
                    {!e.revokedAt && can("marketing.operate") ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void action.run(async () => {
                            await marketingApi.revokeAssetAccess(asset.id, e.id);
                            await refresh();
                          })
                        }
                      >
                        {t("marketing.access.revoke")}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {can("marketing.operate") ? (
            <AccessForm assetId={asset.id} onSaved={() => void refresh()} />
          ) : null}

          <h3 className="mt-5 text-sm font-semibold text-gray-900">
            {t("marketing.assets.relatedChanges")}
          </h3>
          <ul className="mt-1 space-y-1 text-sm">
            {(changes.data ?? []).slice(0, 10).map((c) => (
              <li key={c.id}>
                <Link href={`/marketing/changes/${c.id}`} className="text-blue-600 hover:underline">
                  {c.title}
                </Link>{" "}
                <span className="text-xs text-gray-500">
                  {t(`marketing.changeStatus.${c.status}`)} · {date(c.updatedAt)}
                </span>
              </li>
            ))}
            {changes.data?.length === 0 ? <li className="text-gray-500">—</li> : null}
          </ul>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={t("marketing.assets.deleteTitle")}
        description={t("marketing.assets.deleteDescription")}
        onConfirm={() => {
          setConfirmDelete(false);
          void action.run(async () => {
            await marketingApi.deleteAsset(assetId);
            await refresh();
            onClose();
          });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}

export default function MarketingAssetsPage() {
  const t = useT();
  const { date } = useFormatters();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { can } = useMarketingAccess();
  const { data, isLoading, error, refetch } = useMarketingAssets();
  const [editing, setEditing] = useState<{
    id: string | null;
    form: UpsertMarketingAssetRequest;
  } | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const openId = searchParams.get("asset");
  const setOpenId = (id: string | null) =>
    router.replace(id ? `${pathname}?asset=${id}` : pathname);

  const assets = (data ?? []).filter((a) => !typeFilter || a.type === typeFilter);

  return (
    <div>
      <PageHeader
        title={t("marketing.assets.title")}
        description={t("marketing.assets.description")}
        actions={
          <>
            <select
              className={`${inputClass} w-auto`}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">{t("marketing.common.allTypes")}</option>
              {MARKETING_ASSET_TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`marketing.assetTypes.${x}`)}
                </option>
              ))}
            </select>
            {can("marketing.operate") ? (
              <Button variant="primary" onClick={() => setEditing({ id: null, form: EMPTY_FORM })}>
                + {t("marketing.assets.create")}
              </Button>
            ) : null}
          </>
        }
      />
      {error ? (
        <ErrorBanner message={t("marketing.common.loadFailed")} onRetry={() => void refetch()} />
      ) : null}
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-white" />
      ) : assets.length === 0 ? (
        <EmptyState
          title={t("marketing.assets.empty")}
          description={t("marketing.assets.emptyDescription")}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">{t("marketing.assets.fields.name")}</th>
                <th className="px-4 py-2 font-medium">{t("marketing.assets.fields.type")}</th>
                <th className="px-4 py-2 font-medium">{t("marketing.assets.fields.externalId")}</th>
                <th className="px-4 py-2 font-medium">{t("marketing.assets.primary")}</th>
                <th className="px-4 py-2 font-medium">{t("marketing.assets.secondary")}</th>
                <th className="px-4 py-2 font-medium">
                  {t("marketing.assets.fields.billingEntity")}
                </th>
                <th className="px-4 py-2 font-medium">{t("marketing.assets.lastVerified")}</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr
                  key={a.id}
                  className={`border-t border-gray-100 hover:bg-gray-50 ${a.status === "retired" ? "text-gray-400" : ""}`}
                >
                  <td className="px-4 py-2 font-medium text-gray-900">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => setOpenId(a.id)}
                    >
                      {a.name}
                    </button>
                  </td>
                  <td className="px-4 py-2">{t(`marketing.assetTypes.${a.type}`)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{a.externalId ?? "—"}</td>
                  <td className="px-4 py-2">
                    {a.primaryOwnerName ?? (
                      <span className="text-amber-700">⚠ {t("marketing.common.unassigned")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {a.secondaryOwnerName ?? (
                      <span className="text-amber-700">⚠ {t("marketing.common.unassigned")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{a.billingEntity ?? "—"}</td>
                  <td className="px-4 py-2">
                    {a.lastVerifiedAt ? date(a.lastVerifiedAt) : t("marketing.common.never")}
                    {a.verificationOverdue ? (
                      <span className="ml-1">
                        <Pill tone="amber">{t("marketing.assets.verifyDue")}</Pill>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && !editing ? (
        <AssetDetail
          assetId={openId}
          onClose={() => setOpenId(null)}
          onEdit={(asset) => setEditing({ id: asset.id, form: toForm(asset) })}
        />
      ) : null}
      {editing ? (
        <AssetForm
          initial={editing.form}
          assetId={editing.id}
          assets={data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: queryKeys.marketing });
          }}
        />
      ) : null}
    </div>
  );
}
