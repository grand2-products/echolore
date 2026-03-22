"use client";

import { useCallback, useState } from "react";
import { useT } from "@/lib/i18n";

export interface VrmMeta {
  metaVersion: "0" | "1";
  name: string;
  authors: string[];
  licenseUrl: string;
  /** Extended fields – only shown in the detail popup */
  version?: string;
  copyrightInformation?: string;
  contactInformation?: string;
  references?: string[];
  thirdPartyLicenses?: string;
  avatarPermission?: string;
  allowExcessivelyViolentUsage?: boolean;
  allowExcessivelySexualUsage?: boolean;
  commercialUsage?: string;
  allowPoliticalOrReligiousUsage?: boolean;
  allowAntisocialOrHateUsage?: boolean;
  creditNotation?: string;
  allowRedistribution?: boolean;
  modification?: string;
  otherLicenseUrl?: string;
}

interface VrmMetaPanelProps {
  meta: VrmMeta;
}

/* ------------------------------------------------------------------ */
/*  Full-metadata detail dialog                                       */
/* ------------------------------------------------------------------ */

function MetaDetailDialog({
  meta,
  open,
  onClose,
}: {
  meta: VrmMeta;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!open) return null;

  const boolLabel = (v: boolean | undefined) =>
    v === undefined
      ? "—"
      : v
        ? t("aituber.characters.vrmMeta.allowed")
        : t("aituber.characters.vrmMeta.notAllowed");

  /** Rows to render – hidden when value is empty / undefined */
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: t("aituber.characters.vrmMeta.modelName"), value: meta.name || "—" },
    { label: t("aituber.characters.vrmMeta.author"), value: meta.authors.join(", ") || "—" },
    { label: t("aituber.characters.vrmMeta.modelVersion"), value: meta.version },
    {
      label: t("aituber.characters.vrmMeta.specVersion"),
      value: meta.metaVersion === "0" ? "VRM 0.x" : "VRM 1.0",
    },
    { label: t("aituber.characters.vrmMeta.copyright"), value: meta.copyrightInformation },
    { label: t("aituber.characters.vrmMeta.contact"), value: meta.contactInformation },
    {
      label: t("aituber.characters.vrmMeta.references"),
      value: meta.references?.length ? meta.references.join("\n") : undefined,
    },
    {
      label: t("aituber.characters.vrmMeta.license"),
      value: meta.licenseUrl ? (
        <a
          href={meta.licenseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline break-all"
        >
          {meta.licenseUrl}
        </a>
      ) : undefined,
    },
    {
      label: t("aituber.characters.vrmMeta.otherLicense"),
      value: meta.otherLicenseUrl ? (
        <a
          href={meta.otherLicenseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline break-all"
        >
          {meta.otherLicenseUrl}
        </a>
      ) : undefined,
    },
    { label: t("aituber.characters.vrmMeta.thirdPartyLicenses"), value: meta.thirdPartyLicenses },
    { label: t("aituber.characters.vrmMeta.avatarPermission"), value: meta.avatarPermission },
    { label: t("aituber.characters.vrmMeta.commercialUsage"), value: meta.commercialUsage },
    { label: t("aituber.characters.vrmMeta.modification"), value: meta.modification },
    { label: t("aituber.characters.vrmMeta.creditNotation"), value: meta.creditNotation },
    {
      label: t("aituber.characters.vrmMeta.allowRedistribution"),
      value:
        meta.allowRedistribution !== undefined ? boolLabel(meta.allowRedistribution) : undefined,
    },
    {
      label: t("aituber.characters.vrmMeta.violentUsage"),
      value:
        meta.allowExcessivelyViolentUsage !== undefined
          ? boolLabel(meta.allowExcessivelyViolentUsage)
          : undefined,
    },
    {
      label: t("aituber.characters.vrmMeta.sexualUsage"),
      value:
        meta.allowExcessivelySexualUsage !== undefined
          ? boolLabel(meta.allowExcessivelySexualUsage)
          : undefined,
    },
    {
      label: t("aituber.characters.vrmMeta.politicalOrReligiousUsage"),
      value:
        meta.allowPoliticalOrReligiousUsage !== undefined
          ? boolLabel(meta.allowPoliticalOrReligiousUsage)
          : undefined,
    },
    {
      label: t("aituber.characters.vrmMeta.antisocialOrHateUsage"),
      value:
        meta.allowAntisocialOrHateUsage !== undefined
          ? boolLabel(meta.allowAntisocialOrHateUsage)
          : undefined,
    },
  ];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close requires a div (no nested buttons)
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {t("aituber.characters.vrmMeta.allMetadata")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <title>Close</title>
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {meta.metaVersion === "0" && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {t("aituber.characters.vrmMeta.vrm0Warning")}
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {rows.map(
            (row) =>
              row.value !== undefined &&
              row.value !== "" && (
                <div key={row.label} className="flex gap-3 py-2 text-sm">
                  <span className="w-36 shrink-0 text-gray-400">{row.label}</span>
                  <span className="break-all whitespace-pre-wrap text-gray-900">{row.value}</span>
                </div>
              )
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary panel (existing) + "show all" button                      */
/* ------------------------------------------------------------------ */

export function VrmMetaPanel({ meta }: VrmMetaPanelProps) {
  const t = useT();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      {meta.metaVersion === "0" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {t("aituber.characters.vrmMeta.vrm0Warning")}
        </div>
      )}
      <div className="space-y-1 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <div className="flex gap-2">
          <span className="shrink-0 text-gray-400">
            {t("aituber.characters.vrmMeta.modelName")}
          </span>
          <span className="break-all text-gray-900">{meta.name || "—"}</span>
        </div>
        {meta.authors.length > 0 && (
          <div className="flex gap-2">
            <span className="shrink-0 text-gray-400">{t("aituber.characters.vrmMeta.author")}</span>
            <span className="break-all text-gray-900">{meta.authors.join(", ")}</span>
          </div>
        )}
        {meta.licenseUrl && (
          <div className="flex gap-2">
            <span className="shrink-0 text-gray-400">
              {t("aituber.characters.vrmMeta.license")}
            </span>
            <span className="break-all text-gray-900">{meta.licenseUrl}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="shrink-0 text-gray-400">{t("aituber.characters.vrmMeta.version")}</span>
          <span className="text-gray-900">VRM {meta.metaVersion === "0" ? "0.x" : "1.0"}</span>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="mt-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
        >
          {t("aituber.characters.vrmMeta.showAll")}
        </button>
      </div>

      <MetaDetailDialog meta={meta} open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
