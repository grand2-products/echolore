"use client";

const DEFAULT_COLOR = "bg-gray-100 text-gray-800";
const VALID_CLASS_RE = /^[a-zA-Z0-9\s\-_:/[\]]+$/;

interface StatusBadgeProps {
  status: string;
  colorMap?: Record<string, string>;
  label?: string;
}

export function StatusBadge({ status, colorMap, label }: StatusBadgeProps) {
  const raw = colorMap?.[status] ?? DEFAULT_COLOR;
  const colors = VALID_CLASS_RE.test(raw) ? raw : DEFAULT_COLOR;

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}>
      {label ?? status}
    </span>
  );
}
