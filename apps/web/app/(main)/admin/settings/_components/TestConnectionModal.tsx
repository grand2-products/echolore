"use client";

import { useT } from "@/lib/i18n";

export interface TestModalState {
  title: string;
  status: "loading" | "success" | "error";
  message: string;
}

interface TestConnectionModalProps {
  modal: TestModalState;
  onClose: () => void;
}

export function TestConnectionModal({ modal, onClose }: TestConnectionModalProps) {
  const t = useT();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          {modal.status === "loading" ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
              <svg className="h-5 w-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : modal.status === "success" ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
              <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-gray-900">{modal.title}</h3>
            <p className={`mt-2 whitespace-pre-wrap break-words text-sm ${
              modal.status === "success" ? "text-gray-700" : modal.status === "error" ? "text-red-700" : "text-gray-500"
            }`}>
              {modal.message}
            </p>
          </div>
        </div>
        {modal.status !== "loading" && (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              {t("admin.settings.close")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
