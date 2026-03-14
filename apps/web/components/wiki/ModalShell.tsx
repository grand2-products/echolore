"use client";

import { useCallback } from "react";

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function ModalShell({ open, onClose, children }: ModalShellProps) {
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        {children}
      </div>
    </div>
  );
}
