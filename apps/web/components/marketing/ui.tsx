"use client";

import type { MarketingAssetDto, MarketingMemberDto } from "@echolore/shared/contracts";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { ModalShell } from "@/components/wiki/ModalShell";
import { marketingApi, queryKeys, useWikiPagesQuery } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";

export const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50";

const BUTTON_VARIANTS = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-gray-600 hover:bg-gray-100",
} as const;

export function buttonClass(
  variant: keyof typeof BUTTON_VARIANTS = "secondary",
  size: "sm" | "md" = "md"
) {
  const sizing = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";
  return `inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${BUTTON_VARIANTS[variant]}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: "sm" | "md";
}) {
  return <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-gray-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white ${className}`}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {actions}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-gray-500">{hint}</span> : null}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <ModalShell open={open} onClose={onClose} maxWidth={wide ? "max-w-3xl" : "max-w-lg"}>
      <div className="flex max-h-[85vh] flex-col">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>
        <div className="-mx-1 flex-1 overflow-y-auto px-1">{children}</div>
        {footer ? <div className="mt-4 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </ModalShell>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "info" | "warning" | "danger" | "success";
  children: ReactNode;
}) {
  const tones = {
    info: "border-blue-200 bg-blue-50 text-blue-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return <div className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
}

/** Status pill: status is never conveyed by color alone — the label is always shown. */
export function Pill({
  tone,
  children,
}: {
  tone: "gray" | "blue" | "green" | "amber" | "red" | "violet";
  children: ReactNode;
}) {
  const tones = {
    gray: "bg-gray-100 text-gray-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Runs an async action with pending + localized error state. */
export function useAction() {
  const getApiErrorMessage = useApiErrorMessage();
  const t = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        setError(getApiErrorMessage(err, t("marketing.common.actionFailed")));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [getApiErrorMessage, t]
  );
  return { run, pending, error, setError };
}

// ─── Reference pickers ───────────────────────────────────────────

export function useMarketingMembers() {
  return useQuery({
    queryKey: [...queryKeys.marketing, "members"],
    queryFn: () => marketingApi.members(),
    staleTime: 60_000,
  });
}

export function useMarketingAssets() {
  return useQuery({
    queryKey: [...queryKeys.marketing, "assets"],
    queryFn: () => marketingApi.listAssets(),
  });
}

export function UserSelect({
  value,
  onChange,
  members,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  members: MarketingMemberDto[] | undefined;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <select
      className={inputClass}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t("marketing.common.unassigned")}</option>
      {(members ?? []).map((m) => (
        <option key={m.id} value={m.id}>
          {m.name} ({m.email})
        </option>
      ))}
    </select>
  );
}

export function AssetSelect({
  value,
  onChange,
  assets,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  assets: MarketingAssetDto[] | undefined;
}) {
  const t = useT();
  return (
    <select
      className={inputClass}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t("marketing.common.none")}</option>
      {(assets ?? []).map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} — {t(`marketing.assetTypes.${a.type}`)}
        </option>
      ))}
    </select>
  );
}

export function WikiPageSelect({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
}) {
  const t = useT();
  const { data } = useWikiPagesQuery();
  const pages = useMemo(
    () =>
      [...(data?.pages ?? [])]
        .filter((p) => !p.deletedAt)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [data]
  );
  return (
    <select
      className={inputClass}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t("marketing.common.none")}</option>
      {pages.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title || t("marketing.common.untitled")}
          {p.spaceName ? ` — ${p.spaceName}` : ""}
        </option>
      ))}
    </select>
  );
}

export function WikiLink({ pageId, label }: { pageId: string | null | undefined; label?: string }) {
  const t = useT();
  if (!pageId) return null;
  return (
    <Link href={`/wiki/${pageId}`} className="text-sm text-blue-600 hover:underline">
      {label ?? t("marketing.common.openWiki")} →
    </Link>
  );
}

export function ExternalLink({
  href,
  children,
}: {
  href: string | null | undefined;
  children: ReactNode;
}) {
  if (!href || !/^https?:\/\//i.test(href)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-blue-600 hover:underline"
    >
      {children} ↗
    </a>
  );
}

/** Splits comma / newline separated input into a trimmed list. */
export function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}
