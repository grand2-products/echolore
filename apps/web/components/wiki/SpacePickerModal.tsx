"use client";

import { useCallback } from "react";
import { useSpacesQuery } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { ModalShell } from "./ModalShell";
import { SpaceList } from "./SpaceList";

interface SpacePickerModalProps {
  open: boolean;
  onClose: () => void;
  onAddSubPage: (parentId?: string, spaceId?: string) => void;
  loading?: boolean;
}

export function SpacePickerModal({ open, onClose, onAddSubPage, loading }: SpacePickerModalProps) {
  const t = useT();
  const { data: spacesData, isLoading } = useSpacesQuery();
  const spaces = spacesData?.spaces ?? [];

  const handleSelect = useCallback(
    (spaceId: string) => {
      onAddSubPage(undefined, spaceId);
      onClose();
    },
    [onAddSubPage, onClose]
  );

  return (
    <ModalShell open={open} onClose={onClose}>
      <h2 className="mb-1 text-lg font-bold text-gray-900">{t("wiki.newPage.pickSpaceTitle")}</h2>
      <p className="mb-5 text-sm text-gray-500">{t("wiki.newPage.pickSpaceDescription")}</p>

      {isLoading ? (
        <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
      ) : (
        <SpaceList spaces={spaces} onSelect={handleSelect} disabled={loading} />
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
