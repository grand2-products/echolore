"use client";

import { useT } from "@/lib/i18n";

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message, className = "" }: LoadingStateProps) {
  const t = useT();

  return (
    <div className={`text-center ${className}`}>
      <p className="text-sm text-gray-500">{message ?? t("common.status.loading")}</p>
    </div>
  );
}
