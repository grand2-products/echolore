"use client";

import { adminApi, getSiteIconUrl } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useRef, useState } from "react";
import { SettingsSectionShell } from "./SettingsSectionShell";

const SITE_ICON_MAX_BYTES = 256 * 1024;
const SITE_ICON_ALLOWED_EXTENSIONS = [".png", ".svg", ".ico"];

interface SiteIconSectionProps {
  initialHasSiteIcon: boolean;
}

export function SiteIconSection({ initialHasSiteIcon }: SiteIconSectionProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [hasSiteIcon, setHasSiteIcon] = useState(initialHasSiteIcon);
  const [iconUploading, setIconUploading] = useState(false);
  const [iconRemoving, setIconRemoving] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);
  const [iconNotice, setIconNotice] = useState<string | null>(null);
  const [iconVersion, setIconVersion] = useState(Date.now());
  const [iconDragging, setIconDragging] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const handleIconUpload = async (file: File) => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!SITE_ICON_ALLOWED_EXTENSIONS.includes(ext)) {
      setIconError(t("admin.settings.siteIconFormatError"));
      return;
    }
    if (file.size > SITE_ICON_MAX_BYTES) {
      setIconError(t("admin.settings.siteIconSizeError"));
      return;
    }
    setIconUploading(true);
    setIconError(null);
    setIconNotice(null);
    try {
      await adminApi.uploadSiteIcon(file);
      setHasSiteIcon(true);
      setIconVersion(Date.now());

      if (iconInputRef.current) iconInputRef.current.value = "";
      setIconNotice(t("admin.settings.siteIconUpdated"));
    } catch (uploadError) {
      setIconError(getApiErrorMessage(uploadError, t("admin.settings.siteIconUploadError")));
    } finally {
      setIconUploading(false);
    }
  };

  return (
    <SettingsSectionShell
      title={t("admin.settings.siteIcon")}
      description={t("admin.settings.siteIconDescription")}
      error={iconError}
      notice={iconNotice}
    >
      <div className="space-y-4">
        {hasSiteIcon && (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${getSiteIconUrl()}?v=${iconVersion}`}
              alt="Site icon"
              className="h-10 w-10 rounded border border-gray-200 object-contain"
            />
            <span className="text-sm text-gray-500">{t("admin.settings.siteIcon")}</span>
          </div>
        )}

        {/* Drop zone + file input */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIconDragging(true);
          }}
          onDragLeave={() => setIconDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIconDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) {
              void handleIconUpload(file);
            }
          }}
          onClick={() => iconInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              iconInputRef.current?.click();
            }
          }}
          // biome-ignore lint/a11y/useSemanticElements: drag-drop zone with click handler
          role="button"
          tabIndex={0}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            iconDragging
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
          }`}
        >
          <input
            ref={iconInputRef}
            type="file"
            accept={SITE_ICON_ALLOWED_EXTENSIONS.join(",")}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;

              if (file) void handleIconUpload(file);
            }}
            className="hidden"
          />
          {iconUploading ? (
            <span className="text-sm text-blue-600">{t("admin.settings.siteIconUploading")}</span>
          ) : (
            <>
              <span className="text-sm font-medium text-gray-600">
                {t("admin.settings.siteIconDropHint")}
              </span>
              <span className="mt-1 text-xs text-gray-400">PNG / SVG / ICO, max 256KB</span>
            </>
          )}
        </div>

        {hasSiteIcon && (
          <button
            type="button"
            disabled={iconRemoving}
            onClick={async () => {
              setIconRemoving(true);
              setIconError(null);
              setIconNotice(null);
              try {
                await adminApi.deleteSiteIcon();
                setHasSiteIcon(false);
                setIconNotice(t("admin.settings.siteIconRemoved"));
              } catch (removeError) {
                setIconError(
                  getApiErrorMessage(removeError, t("admin.settings.siteIconRemoveError"))
                );
              } finally {
                setIconRemoving(false);
              }
            }}
            className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {iconRemoving
              ? t("admin.settings.siteIconRemoving")
              : t("admin.settings.siteIconRemove")}
          </button>
        )}
      </div>
    </SettingsSectionShell>
  );
}
