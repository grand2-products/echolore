"use client";

import { useT } from "@/lib/i18n";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorBanner({ message, onRetry, className = "" }: ErrorBannerProps) {
  const t = useT();

  if (onRetry) {
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 ${className}`}
      >
        <span>{message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
        >
          {t("common.actions.retry")}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 ${className}`}
    >
      {message}
    </div>
  );
}
