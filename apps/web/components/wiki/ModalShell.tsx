"use client";

import { useCallback, useEffect, useRef } from "react";

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function ModalShell({ open, onClose, children }: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 outline-none"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">{children}</div>
    </div>
  );
}
