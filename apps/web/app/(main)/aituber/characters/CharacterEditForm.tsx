"use client";

import { MAX_VRM_FILE_SIZE_BYTES } from "@echolore/shared/contracts";
import { useEffect, useMemo, useState } from "react";
import type { TtsVoice } from "@/lib/api/aituber";
import { aituberApi } from "@/lib/api/aituber";
import { useT } from "@/lib/i18n";
import type { CharacterForm } from "./use-character-form";
import { VrmMetaPanel } from "./VrmMetaPanel";

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
        <Field label={t("aituber.characters.name")}>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onUpdateField("name", e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </Field>

        <Field label={t("aituber.characters.personality")}>
          <textarea
            value={form.personality}
            onChange={(e) => onUpdateField("personality", e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </Field>

        <Field label={t("aituber.characters.systemPrompt")}>
          <textarea
            value={form.systemPrompt}
            onChange={(e) => onUpdateField("systemPrompt", e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </Field>

        <Field label={t("aituber.characters.speakingStyle")}>
          <input
            type="text"
            value={form.speakingStyle}
            onChange={(e) => onUpdateField("speakingStyle", e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t("aituber.characters.languageCode")}>
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

          <Field label={t("aituber.characters.voiceName")}>
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

        <Field label={t("aituber.characters.avatarFile")}>
          <input
            type="file"
            accept=".vrm,model/gltf-binary"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (file && file.size > MAX_VRM_FILE_SIZE_BYTES) {
                onError(t("aituber.characters.fileTooLarge") ?? "File exceeds 50MB limit");
                e.target.value = "";
                return;
              }
              setSelectedFile(file);
              onAvatarFileChange(file);
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
          <p className="mt-1 text-xs text-gray-500">{t("aituber.characters.avatarUploadHint")}</p>
          {selectedFile && <VrmMetaPanel file={selectedFile} />}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-gray-700">
        {label}
      </label>
      <div id={id}>{children}</div>
    </div>
  );
}
