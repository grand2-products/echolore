"use client";

import { ModalShell } from "@/components/wiki/ModalShell";
import { useT } from "@/lib/i18n";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "danger" | "warning" | "default";
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  variant = "danger",
  disabled,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();

  const buttonClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : variant === "warning"
        ? "bg-amber-600 hover:bg-amber-700"
        : "bg-blue-600 hover:bg-blue-700";

  return (
    <ModalShell open={open} onClose={onCancel}>
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
      {description && <p className="mb-4 text-sm text-gray-600">{description}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t("common.actions.cancel")}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onConfirm}
          className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${buttonClass}`}
        >
          {confirmLabel ?? t("common.actions.confirm")}
        </button>
      </div>
    </ModalShell>
  );
}
