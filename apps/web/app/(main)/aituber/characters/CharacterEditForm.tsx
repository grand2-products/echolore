"use client";

import { MAX_VRM_FILE_SIZE_BYTES } from "@echolore/shared/contracts";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TtsVoice } from "@/lib/api/aituber";
import { aituberApi } from "@/lib/api/aituber";
import { useT } from "@/lib/i18n";
import type { CharacterForm } from "./use-character-form";
import { type VrmMeta, VrmMetaPanel } from "./VrmMetaPanel";

const VrmPreviewCanvas = dynamic(
  () =>
    import("@/components/aituber/VrmPreviewCanvas").then((m) => ({ default: m.VrmPreviewCanvas })),
  { ssr: false, loading: () => <div className="h-full w-full bg-gray-900 rounded-lg" /> }
);

interface CharacterEditFormProps {
  isNew: boolean;
  form: CharacterForm;
  saving: boolean;
  avatarUrl: string | null;
  onUpdateField: <K extends keyof CharacterForm>(key: K, value: CharacterForm[K]) => void;
  onAvatarFileChange: (file: File | null) => void;
  onSave: () => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}

export function CharacterEditForm({
  isNew,
  form,
  saving,
  avatarUrl,
  onUpdateField,
  onAvatarFileChange,
  onSave,
  onCancel,
  onError,
}: CharacterEditFormProps) {
  const t = useT();
  const [allVoices, setAllVoices] = useState<TtsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);

  // Fetch all voices once
  useEffect(() => {
    let cancelled = false;
    aituberApi
      .listVoices()
      .then(({ voices }) => {
        if (!cancelled) setAllVoices(voices);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingVoices(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Derive unique language codes sorted alphabetically
  const languageCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const v of allVoices) {
      for (const lc of v.languageCodes) {
        codes.add(lc);
      }
    }
    return [...codes].sort();
  }, [allVoices]);

  // Filter voices for selected languageCode
  const filteredVoices = useMemo(
    () =>
      form.languageCode ? allVoices.filter((v) => v.languageCodes.includes(form.languageCode)) : [],
    [allVoices, form.languageCode]
  );

  const handleLanguageChange = (languageCode: string) => {
    onUpdateField("languageCode", languageCode);
    // Reset voice when language changes (current voice may not be available)
    onUpdateField("voiceName", "");
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        {isNew ? t("aituber.characters.create") : t("aituber.characters.edit")}
      </h2>

      <div className="space-y-4">
        <Field label={t("aituber.characters.name")} tooltip={t("aituber.characters.tooltips.name")}>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onUpdateField("name", e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </Field>

        <Field
          label={t("aituber.characters.personality")}
          tooltip={t("aituber.characters.tooltips.personality")}
        >
          <textarea
            value={form.personality}
            onChange={(e) => onUpdateField("personality", e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </Field>

        <Field
          label={t("aituber.characters.systemPrompt")}
          tooltip={t("aituber.characters.tooltips.systemPrompt")}
        >
          <textarea
            value={form.systemPrompt}
            onChange={(e) => onUpdateField("systemPrompt", e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </Field>

        <Field
          label={t("aituber.characters.speakingStyle")}
          tooltip={t("aituber.characters.tooltips.speakingStyle")}
        >
          <input
            type="text"
            value={form.speakingStyle}
            onChange={(e) => onUpdateField("speakingStyle", e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label={t("aituber.characters.languageCode")}
            tooltip={t("aituber.characters.tooltips.languageCode")}
          >
            {loadingVoices ? (
              <div className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                {t("common.status.loading")}
              </div>
            ) : languageCodes.length > 0 ? (
              <select
                value={form.languageCode}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                {!languageCodes.includes(form.languageCode) && form.languageCode && (
                  <option value={form.languageCode}>{form.languageCode}</option>
                )}
                {languageCodes.map((lc) => (
                  <option key={lc} value={lc}>
                    {lc}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={form.languageCode}
                onChange={(e) => handleLanguageChange(e.target.value)}
                placeholder="ja-JP"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            )}
          </Field>

          <Field
            label={t("aituber.characters.voiceName")}
            tooltip={t("aituber.characters.tooltips.voiceName")}
          >
            {filteredVoices.length > 0 ? (
              <select
                value={form.voiceName}
                onChange={(e) => onUpdateField("voiceName", e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">{t("aituber.characters.voiceDefault")}</option>
                {filteredVoices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.gender})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={form.voiceName}
                onChange={(e) => onUpdateField("voiceName", e.target.value)}
                placeholder="ja-JP-Wavenet-A"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            )}
          </Field>
        </div>

        <Field
          label={t("aituber.characters.avatarFile")}
          tooltip={t("aituber.characters.tooltips.avatarFile")}
        >
          <VrmFileInput onFileSelect={onAvatarFileChange} onError={onError} />
        </Field>

        {avatarUrl && (
          <Field label={t("aituber.characters.avatarPreview")}>
            <a
              href={avatarUrl.startsWith("/") || avatarUrl.startsWith("https://") ? avatarUrl : "#"}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              {t("aituber.characters.avatarDownload")}
            </a>
          </Field>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.isPublic}
            onChange={(e) => onUpdateField("isPublic", e.target.checked)}
            className="rounded border-gray-300"
          />
          {t("aituber.characters.isPublic")}
          <Tooltip text={t("aituber.characters.tooltips.isPublic")} />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t("common.actions.cancel")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !form.name || !form.personality || !form.systemPrompt}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? t("aituber.characters.saving") : t("aituber.characters.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-center gap-1 text-sm text-gray-700">
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      <div id={id}>{children}</div>
    </div>
  );
}

function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative cursor-help text-gray-400" role="img" aria-label={text}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
          clipRule="evenodd"
        />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-56 -translate-x-1/2 rounded bg-gray-800 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function VrmFileInput({
  onFileSelect,
  onError,
}: {
  onFileSelect: (file: File | null) => void;
  onError: (msg: string) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [validating, setValidating] = useState(false);
  const [vrmMeta, setVrmMeta] = useState<VrmMeta | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file) {
        setFileName(null);
        setVrmMeta(null);
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
        }
        setPreviewUrl(null);
        onFileSelect(null);
        return;
      }
      if (!file.name.toLowerCase().endsWith(".vrm")) {
        onError(t("aituber.characters.invalidVrmExtension"));
        return;
      }
      if (file.size > MAX_VRM_FILE_SIZE_BYTES) {
        onError(t("aituber.characters.fileTooLarge"));
        return;
      }
      setValidating(true);
      try {
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");

        const loader = new GLTFLoader();
        loader.register((parser: unknown) => new VRMLoaderPlugin(parser as never));

        const buffer = await file.arrayBuffer();
        const gltf = await loader.parseAsync(buffer, "");
        const vrm = gltf.userData.vrm;
        if (!vrm) {
          onError(t("aituber.characters.invalidVrmFormat"));
          return;
        }
        const meta = vrm.meta;
        const isVrm0 = meta?.metaVersion === "0";
        setVrmMeta({
          metaVersion: isVrm0 ? "0" : "1",
          name: (isVrm0 ? meta?.title : meta?.name) || file.name,
          authors: isVrm0
            ? ([meta?.author].filter(Boolean) as string[])
            : Array.isArray(meta?.authors)
              ? (meta.authors as string[])
              : [],
          licenseUrl: (isVrm0 ? meta?.licenseName : meta?.licenseUrl) ?? "",
        });
        // Clean up parsed scene to free memory
        VRMUtils.deepDispose(vrm.scene);
        // Create blob URL for 3D preview
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const blobUrl = URL.createObjectURL(file);
        previewUrlRef.current = blobUrl;
        setPreviewUrl(blobUrl);
        setFileName(file.name);
        onFileSelect(file);
      } catch {
        onError(t("aituber.characters.invalidVrmFormat"));
      } finally {
        setValidating(false);
      }
    },
    [onError, onFileSelect, t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0] ?? null;
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: dropzone needs div for drag-and-drop layout */}
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-colors ${
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="h-8 w-8 text-gray-400"
          aria-hidden="true"
        >
          <title>Upload</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13"
          />
        </svg>
        {validating ? (
          <p className="text-sm text-gray-500">{t("aituber.characters.avatarValidating")}</p>
        ) : fileName ? (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">{fileName}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="text-gray-400 hover:text-red-500"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <title>Clear</title>
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600">{t("aituber.characters.avatarDropzone")}</p>
            <p className="text-xs text-gray-400">{t("aituber.characters.avatarUploadHint")}</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".vrm,model/gltf-binary"
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>
      {vrmMeta && (
        <div className="mt-3">
          <VrmMetaPanel meta={vrmMeta} />
        </div>
      )}
      {previewUrl && (
        <div className="mt-3 h-96 w-full overflow-hidden rounded-lg border border-gray-200">
          <VrmPreviewCanvas avatarUrl={previewUrl} />
        </div>
      )}
    </>
  );
}
