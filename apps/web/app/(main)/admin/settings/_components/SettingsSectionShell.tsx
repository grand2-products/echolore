"use client";

import { useT } from "@/lib/i18n";
import type { ReactNode } from "react";

export const INPUT_CLASS = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";

interface SettingsSectionShellProps {
  title: string;
  description?: string;
  error: string | null;
  notice: string | null;
  loading?: boolean;
  onRetry?: () => void;
  children: ReactNode;
}

interface SettingsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}

export function SettingsCheckbox({ checked, onChange, label, hint }: SettingsCheckboxProps) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-gray-300"
      />
      <div>
        <div className="font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-gray-500">{hint}</div>
      </div>
    </label>
  );
}

export function SettingsSectionShell({
  title,
  description,
  error,
  notice,
  loading,
  onRetry,
  children,
}: SettingsSectionShellProps) {
  const t = useT();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">{title}</h2>
      {description ? <p className="mb-4 text-sm text-gray-500">{description}</p> : null}

      {error ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              {t("common.actions.retry")}
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
          {t("admin.settings.loading")}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
