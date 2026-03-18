"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

interface VrmMeta {
  metaVersion: "0" | "1";
  name: string;
  authors: string[];
  licenseUrl: string;
}

async function loadVrmMeta(file: File): Promise<VrmMeta> {
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");

  const url = URL.createObjectURL(file);
  try {
    const loader = new GLTFLoader();
    loader.register((parser: unknown) => new VRMLoaderPlugin(parser as never));
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error("No VRM data");

    const meta = vrm.meta;
    const result: VrmMeta =
      meta.metaVersion === "0"
        ? {
            metaVersion: "0",
            name: meta.title ?? "",
            authors: [meta.author].filter(Boolean) as string[],
            licenseUrl: meta.licenseName ?? "",
          }
        : {
            metaVersion: "1",
            name: meta.name ?? "",
            authors: Array.isArray(meta.authors) ? (meta.authors as string[]) : [],
            licenseUrl: meta.licenseUrl ?? "",
          };

    VRMUtils.deepDispose(vrm.scene);
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface VrmMetaPanelProps {
  file: File;
}

export function VrmMetaPanel({ file }: VrmMetaPanelProps) {
  const t = useT();
  const [meta, setMeta] = useState<VrmMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setMeta(null);

    loadVrmMeta(file)
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  if (loading) {
    return <p className="mt-2 text-xs text-gray-400">{t("aituber.characters.vrmMeta.loading")}</p>;
  }

  if (error || !meta) {
    return <p className="mt-2 text-xs text-red-500">{t("aituber.characters.vrmMeta.error")}</p>;
  }

  return (
    <div className="mt-2 space-y-1.5">
      {meta.metaVersion === "0" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {t("aituber.characters.vrmMeta.vrm0Warning")}
        </div>
      )}
      <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-1">
        <div className="flex gap-2">
          <span className="shrink-0 text-gray-400">
            {t("aituber.characters.vrmMeta.modelName")}
          </span>
          <span className="text-gray-900 break-all">{meta.name || "—"}</span>
        </div>
        {meta.authors.length > 0 && (
          <div className="flex gap-2">
            <span className="shrink-0 text-gray-400">{t("aituber.characters.vrmMeta.author")}</span>
            <span className="text-gray-900 break-all">{meta.authors.join(", ")}</span>
          </div>
        )}
        {meta.licenseUrl && (
          <div className="flex gap-2">
            <span className="shrink-0 text-gray-400">
              {t("aituber.characters.vrmMeta.license")}
            </span>
            <span className="text-gray-900 break-all">{meta.licenseUrl}</span>
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
