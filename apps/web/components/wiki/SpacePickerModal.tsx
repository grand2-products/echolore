"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { wikiApi, useSpacesQuery, type Space } from "@/lib/api";
import { useT } from "@/lib/i18n";

const SPACE_ICON: Record<string, string> = { general: "G", team: "T", personal: "P" };

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
        .createPage({ title: "", spaceId })
        .then((res) => {
          onClose();
          router.push(`/wiki/${res.page.id}`);
        })
        .catch(() => {
          setError(t("wiki.newPage.createError"));
          creatingRef.current = false;
        });
    },
    [router, t, onClose],
  );

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
        <h2 className="mb-1 text-lg font-bold text-gray-900">
          {t("wiki.newPage.pickSpaceTitle")}
        </h2>
        <p className="mb-5 text-sm text-gray-500">
          {t("wiki.newPage.pickSpaceDescription")}
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
        ) : (
          <div className="space-y-2">
            {spaces.map((space: Space) => (
              <button
                key={space.id}
                type="button"
                onClick={() => handleSelect(space.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left transition hover:border-blue-500 hover:shadow-sm"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-sm font-medium text-gray-600">
                  {SPACE_ICON[space.type] ?? "?"}
                </span>
                <div>
                  <p className="font-medium text-gray-900">{space.name}</p>
                  <p className="text-xs text-gray-500">
                    {t(`wiki.spaces.${space.type}`)}
                  </p>
                </div>
              </button>
            ))}
          </div>
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
      </div>
    </div>
  );
}
