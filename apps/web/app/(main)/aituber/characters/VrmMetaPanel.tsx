"use client";

import { useT } from "@/lib/i18n";

export interface VrmMeta {
  metaVersion: "0" | "1";
  name: string;
  authors: string[];
  licenseUrl: string;
}

interface VrmMetaPanelProps {
  meta: VrmMeta;
}

export function VrmMetaPanel({ meta }: VrmMetaPanelProps) {
  const t = useT();

  return (
    <div className="space-y-1.5">
      {meta.metaVersion === "0" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {t("aituber.characters.vrmMeta.vrm0Warning")}
        </div>
      )}
      <div className="space-y-1 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <div className="flex gap-2">
          <span className="shrink-0 text-gray-400">
            {t("aituber.characters.vrmMeta.modelName")}
          </span>
          <span className="break-all text-gray-900">{meta.name || "—"}</span>
        </div>
        {meta.authors.length > 0 && (
          <div className="flex gap-2">
            <span className="shrink-0 text-gray-400">{t("aituber.characters.vrmMeta.author")}</span>
            <span className="break-all text-gray-900">{meta.authors.join(", ")}</span>
          </div>
        )}
        {meta.licenseUrl && (
          <div className="flex gap-2">
            <span className="shrink-0 text-gray-400">
              {t("aituber.characters.vrmMeta.license")}
            </span>
            <span className="break-all text-gray-900">{meta.licenseUrl}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="shrink-0 text-gray-400">{t("aituber.characters.vrmMeta.version")}</span>
          <span className="text-gray-900">VRM {meta.metaVersion === "0" ? "0.x" : "1.0"}</span>
        </div>
      </div>
    </div>
  );
}
