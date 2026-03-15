"use client";

import { type AdminGroup, type Space, adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useStableEvent } from "@/lib/hooks/use-stable-event";
import { useT } from "@/lib/i18n";
import { useEffect, useState } from "react";

type SpacePermissionDraftRow = {
  groupId: string;
  selected: boolean;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
};

type Props = {
  groups: AdminGroup[];
  spaces: Space[];
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

export function SpacePermissionsSection({ groups, spaces, setError, setNotice }: Props) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [spacePermissionRows, setSpacePermissionRows] = useState<SpacePermissionDraftRow[]>([]);
  const [isSavingSpacePermissions, setIsSavingSpacePermissions] = useState(false);

  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? null;

  // Auto-select first space
  useEffect(() => {
    setSelectedSpaceId((current) => current ?? spaces[0]?.id ?? null);
  }, [spaces]);

  const loadSpacePermissions = useStableEvent(
    async (spaceId: string, availableGroups: AdminGroup[]) => {
      try {
        const detail = await adminApi.getSpacePermissions(spaceId);
        setSpacePermissionRows(
          availableGroups.map((group) => {
            const existing = detail.permissions.find((p) => p.groupId === group.id);
            return {
              groupId: group.id,
              selected: Boolean(existing),
              canRead: existing?.canRead ?? true,
              canWrite: existing?.canWrite ?? false,
              canDelete: existing?.canDelete ?? false,
            };
          })
        );
      } catch (loadError) {
        setError(getApiErrorMessage(loadError, t("admin.access.spacePermissionsLoadError")));
      }
    }
  );

  useEffect(() => {
    if (!selectedSpaceId || groups.length === 0) {
      setSpacePermissionRows([]);
      return;
    }

    void loadSpacePermissions(selectedSpaceId, groups);
  }, [groups, loadSpacePermissions, selectedSpaceId]);

  const saveSpacePermissions = async () => {
    if (!selectedSpaceId) return;

    setIsSavingSpacePermissions(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.setSpacePermissions(selectedSpaceId, {
        permissions: spacePermissionRows
          .filter((row) => row.selected)
          .map((row) => ({
            groupId: row.groupId,
            canRead: row.canRead,
            canWrite: row.canWrite,
            canDelete: row.canDelete,
          })),
      });
      await loadSpacePermissions(selectedSpaceId, groups);
      setNotice(t("admin.access.spacePermissionsUpdated"));
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.access.spacePermissionsSaveError")));
    } finally {
      setIsSavingSpacePermissions(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("admin.access.spacePermissionsTitle")}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {t("admin.access.spacePermissionsDescription")}
        </p>
      </div>

      <label className="mb-4 block text-sm text-gray-700">
        {t("admin.access.space")}
        <select
          value={selectedSpaceId ?? ""}
          onChange={(event) => setSelectedSpaceId(event.target.value || null)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        >
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name} ({space.type})
            </option>
          ))}
        </select>
      </label>

      {selectedSpace ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="font-medium text-gray-900">{selectedSpace.name}</div>
            <div className="mt-1 text-xs text-gray-500">{selectedSpace.type}</div>
          </div>

          <div className="space-y-2">
            {groups.map((group) => {
              const row = spacePermissionRows.find((item) => item.groupId === group.id) ?? {
                groupId: group.id,
                selected: false,
                canRead: true,
                canWrite: false,
                canDelete: false,
              };

              return (
                <div key={group.id} className="rounded-lg border border-gray-200 p-3">
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{group.name}</div>
                      <div className="text-xs text-gray-500">
                        {group.description || t("admin.access.noDescription")}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(event) =>
                        setSpacePermissionRows((current) =>
                          current.map((item) =>
                            item.groupId === group.id
                              ? { ...item, selected: event.target.checked }
                              : item
                          )
                        )
                      }
                    />
                  </label>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-600">
                    <label className="flex items-center gap-2 rounded border border-gray-200 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={row.canRead}
                        disabled={!row.selected}
                        onChange={(event) =>
                          setSpacePermissionRows((current) =>
                            current.map((item) =>
                              item.groupId === group.id
                                ? { ...item, canRead: event.target.checked }
                                : item
                            )
                          )
                        }
                      />
                      {t("admin.access.read")}
                    </label>
                    <label className="flex items-center gap-2 rounded border border-gray-200 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={row.canWrite}
                        disabled={!row.selected}
                        onChange={(event) =>
                          setSpacePermissionRows((current) =>
                            current.map((item) =>
                              item.groupId === group.id
                                ? { ...item, canWrite: event.target.checked }
                                : item
                            )
                          )
                        }
                      />
                      {t("admin.access.write")}
                    </label>
                    <label className="flex items-center gap-2 rounded border border-gray-200 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={row.canDelete}
                        disabled={!row.selected}
                        onChange={(event) =>
                          setSpacePermissionRows((current) =>
                            current.map((item) =>
                              item.groupId === group.id
                                ? { ...item, canDelete: event.target.checked }
                                : item
                            )
                          )
                        }
                      />
                      {t("admin.access.delete")}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={saveSpacePermissions}
            disabled={isSavingSpacePermissions}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {isSavingSpacePermissions
              ? t("admin.access.saving")
              : t("admin.access.saveSpacePermissions")}
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
          {t("admin.access.noSpaces")}
        </div>
      )}
    </section>
  );
}
