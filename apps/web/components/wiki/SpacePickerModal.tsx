"use client";

import { ErrorBanner } from "@/components/ui";
import { useSpacesQuery, wikiApi } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ModalShell } from "./ModalShell";
import { SpaceList } from "./SpaceList";

interface SpacePickerModalProps {
  open: boolean;
  onClose: () => void;
}

export function SpacePickerModal({ open, onClose }: SpacePickerModalProps) {
  const t = useT();
  const router = useRouter();
  const creatingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { data: spacesData, isLoading } = useSpacesQuery();
  const spaces = spacesData?.spaces ?? [];

  const handleSelect = useCallback(
    (spaceId: string) => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      setError(null);

      wikiApi
        .createPage({ title: t("wiki.newPage.defaultTitle"), spaceId })
        .then((res) => {
          onClose();
          router.push(`/wiki/${res.page.id}`);
        })
        .catch(() => {
          setError(t("wiki.newPage.createError"));
          creatingRef.current = false;
        });
    },
    [router, t, onClose]
  );

  return (
    <ModalShell open={open} onClose={onClose}>
      <h2 className="mb-1 text-lg font-bold text-gray-900">{t("wiki.newPage.pickSpaceTitle")}</h2>
      <p className="mb-5 text-sm text-gray-500">{t("wiki.newPage.pickSpaceDescription")}</p>

      {error && <ErrorBanner message={error} className="mb-4" />}

      {isLoading ? (
        <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
      ) : (
        <SpaceList spaces={spaces} onSelect={handleSelect} />
      )}

      <div className="mt-4 text-right">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {t("wiki.newPage.cancel")}
        </button>
      </div>
    </ModalShell>
  );
}
