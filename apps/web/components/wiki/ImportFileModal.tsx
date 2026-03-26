"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ErrorBanner } from "@/components/ui";
import { useImportWikiFileMutation, useSpacesQuery } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { ModalShell } from "./ModalShell";
import { SpaceList } from "./SpaceList";

const ACCEPT = ".md,.typ,.typst";
const ACCEPT_EXTENSIONS = new Set([".md", ".typ", ".typst"]);

function isAcceptedFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return ACCEPT_EXTENSIONS.has(ext);
}

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
  const [dragging, setDragging] = useState(false);
  const { data: spacesData, isLoading } = useSpacesQuery();
  const spaces = spacesData?.spaces ?? [];
  const importMutation = useImportWikiFileMutation();

  const reset = useCallback(() => {
    setSelectedFile(null);
    setSelectedSpaceId(null);
    setError(null);
    setImporting(false);
    setDragging(false);
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!isAcceptedFile(file)) {
        setError(t("wiki.import.invalidFileType"));
        return;
      }
      setSelectedFile(file);
      setError(null);
    },
    [t]
  );

  const handleImport = useCallback(() => {
    if (importingRef.current || !selectedFile || !selectedSpaceId) return;
    importingRef.current = true;
    setImporting(true);
    setError(null);

    importMutation.mutate(
      { file: selectedFile, spaceId: selectedSpaceId },
      {
        onSuccess: (res) => {
          onClose();
          router.push(`/wiki/${res.page.id}`);
        },
        onError: () => {
          setError(t("wiki.import.error"));
          importingRef.current = false;
          setImporting(false);
        },
      }
    );
  }, [selectedFile, selectedSpaceId, router, t, onClose, importMutation]);

  return (
    <ModalShell open={open} onClose={handleClose}>
      <h2 className="mb-1 text-lg font-bold text-gray-900">{t("wiki.import.title")}</h2>
      <p className="mb-5 text-sm text-gray-500">{t("wiki.import.description")}</p>

      {error && <ErrorBanner message={error} className="mb-4" />}

      {/* File picker with drag & drop */}
      <div className="mb-4">
        <label htmlFor="import-file-input" className="mb-1 block text-sm font-medium text-gray-700">
          {t("wiki.import.fileLabel")}
        </label>
        <button
          type="button"
          className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
            dragging
              ? "border-blue-500 bg-blue-50"
              : selectedFile
                ? "border-green-400 bg-green-50"
                : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {selectedFile ? (
            <p className="text-sm text-gray-700">
              {selectedFile.name}{" "}
              <span className="text-gray-500">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              {dragging ? t("wiki.import.dropzoneActive") : t("wiki.import.dropzone")}
            </p>
          )}
        </button>
        <input
          id="import-file-input"
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleFileChange}
          className="hidden"
        />
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
