"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { wikiApi, useSpacesQuery, type Space } from "@/lib/api";
import { useT } from "@/lib/i18n";

const SPACE_ICON: Record<string, string> = { general: "G", team: "T", personal: "P" };

function SpacePicker({
  spaces,
  isLoading,
  onSelect,
}: {
  spaces: Space[];
  isLoading: boolean;
  onSelect: (spaceId: string) => void;
}) {
  const t = useT();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-500">{t("common.status.loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          {t("wiki.newPage.pickSpaceTitle")}
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          {t("wiki.newPage.pickSpaceDescription")}
        </p>
        <div className="space-y-2">
          {spaces.map((space) => (
            <button
              key={space.id}
              type="button"
              onClick={() => onSelect(space.id)}
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
        <div className="mt-4">
          <Link href="/wiki" className="text-sm text-gray-500 hover:text-gray-700">
            {t("wiki.detail.backToWiki")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function NewWikiPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const creatingRef = useRef(false);

  const spaceIdParam = searchParams.get("spaceId");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | undefined>(
    spaceIdParam ?? undefined
  );

  const { data: spacesData, isLoading: spacesLoading } = useSpacesQuery();
  const spaces = spacesData?.spaces ?? [];

  const createInSpace = useCallback(
    (spaceId: string) => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      setError(null);

      wikiApi
        .createPage({ title: "", spaceId })
        .then((res) => {
          router.replace(`/wiki/${res.page.id}`);
        })
        .catch(() => {
          setError(t("wiki.newPage.createError"));
          creatingRef.current = false;
        });
    },
    [router, t]
  );

  useEffect(() => {
    if (selectedSpaceId) {
      createInSpace(selectedSpaceId);
    }
  }, [selectedSpaceId, createInSpace]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-red-600">{error}</p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                creatingRef.current = false;
                if (!spaceIdParam) {
                  setSelectedSpaceId(undefined);
                }
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              {t("common.actions.retry")}
            </button>
            <Link
              href="/wiki"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              {t("wiki.detail.backToWiki")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // No spaceId provided and none selected yet → show picker
  if (!spaceIdParam && !selectedSpaceId) {
    return (
      <SpacePicker
        spaces={spaces}
        isLoading={spacesLoading}
        onSelect={setSelectedSpaceId}
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-gray-500">{t("common.status.loading")}</p>
    </div>
  );
}
