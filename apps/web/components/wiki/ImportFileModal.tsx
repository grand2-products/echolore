"use client";

import { ErrorBanner } from "@/components/ui";
import { useSpacesQuery, wikiApi } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ModalShell } from "./ModalShell";
import { SpaceList } from "./SpaceList";

const ACCEPT = ".md,.typ,.typst";

interface ImportFileModalProps {
  open: boolean;
  onClose: () => void;
}

export function ImportFileModal({ open, onClose }: ImportFileModalProps) {
  const t = useT();
  const router = useRouter();
  const importingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const { data: spacesData, isLoading } = useSpacesQuery();
  const spaces = spacesData?.spaces ?? [];

  const reset = useCallback(() => {
    setSelectedFile(null);
    setSelectedSpaceId(null);
    setError(null);
    setImporting(false);
    importingRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
    setError(null);
  }, []);

  const handleImport = useCallback(() => {
    if (importingRef.current || !selectedFile || !selectedSpaceId) return;
    importingRef.current = true;
    setImporting(true);
    setError(null);

    wikiApi
      .importFile(selectedFile, selectedSpaceId)
      .then((res) => {
        onClose();
        router.push(`/wiki/${res.page.id}`);
      })
      .catch(() => {
        setError(t("wiki.import.error"));
        importingRef.current = false;
        setImporting(false);
      });
  }, [selectedFile, selectedSpaceId, router, t, onClose]);

  return (
    <ModalShell open={open} onClose={handleClose}>
      <h2 className="mb-1 text-lg font-bold text-gray-900">{t("wiki.import.title")}</h2>
      <p className="mb-5 text-sm text-gray-500">{t("wiki.import.description")}</p>

      {error && <ErrorBanner message={error} className="mb-4" />}

      {/* File picker */}
      <div className="mb-4">
        <label htmlFor="import-file-input" className="mb-1 block text-sm font-medium text-gray-700">
          {t("wiki.import.fileLabel")}
        </label>
        <input
          id="import-file-input"
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
        />
        {selectedFile && (
          <p className="mt-1 text-xs text-gray-500">
            {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
          </p>
        )}
      </div>

      {/* Space picker */}
      <div className="mb-4">
        <label
          htmlFor="import-space-select"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          {t("wiki.import.spaceLabel")}
        </label>
        {isLoading ? (
          <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
        ) : (
          <SpaceList
            spaces={spaces}
            selectedId={selectedSpaceId}
            onSelect={setSelectedSpaceId}
            size="sm"
          />
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleClose}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {t("wiki.newPage.cancel")}
        </button>
        <button
          type="button"
          disabled={!selectedFile || !selectedSpaceId || importing}
          onClick={handleImport}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {importing ? t("wiki.import.importing") : t("wiki.import.button")}
        </button>
      </div>
    </ModalShell>
  );
}
