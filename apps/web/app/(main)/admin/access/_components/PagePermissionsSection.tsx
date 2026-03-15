"use client";

import { type AdminGroup, type Page, wikiApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useStableEvent } from "@/lib/hooks/use-stable-event";
import { useT } from "@/lib/i18n";
import { useEffect, useState } from "react";

type PermissionDraftRow = {
  groupId: string;
  selected: boolean;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
};

type Props = {
  groups: AdminGroup[];
  pages: Page[];
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

export function PagePermissionsSection({ groups, pages, setError, setNotice }: Props) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [permissionRows, setPermissionRows] = useState<PermissionDraftRow[]>([]);
  const [inheritFromParent, setInheritFromParent] = useState(true);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? null;

  // Auto-select first page
  useEffect(() => {
    setSelectedPageId((current) => current ?? pages[0]?.id ?? null);
  }, [pages]);

  const loadPagePermissions = useStableEvent(
    async (pageId: string, availableGroups: AdminGroup[]) => {
      try {
        const detail = await wikiApi.getPagePermissions(pageId);
        setInheritFromParent(detail.inheritFromParent);
        setPermissionRows(
          availableGroups.map((group) => {
            const existing = detail.permissions.find(
              (permission) => permission.groupId === group.id
            );
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
        setError(getApiErrorMessage(loadError, t("admin.access.permissionsLoadError")));
      }
    }
  );

  useEffect(() => {
    if (!selectedPageId || groups.length === 0) {
      setPermissionRows([]);
      return;
    }

    void loadPagePermissions(selectedPageId, groups);
  }, [groups, loadPagePermissions, selectedPageId]);

  const savePermissions = async () => {
    if (!selectedPageId) return;

    setIsSavingPermissions(true);
    setError(null);
    setNotice(null);
    try {
      await wikiApi.setPagePermissions(selectedPageId, {
        inheritFromParent,
        permissions: permissionRows
          .filter((row) => row.selected)
          .map((row) => ({
            groupId: row.groupId,
            canRead: row.canRead,
            canWrite: row.canWrite,
            canDelete: row.canDelete,
          })),
      });
      await loadPagePermissions(selectedPageId, groups);
      setNotice(t("admin.access.permissionsUpdated"));
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.access.permissionsSaveError")));
    } finally {
      setIsSavingPermissions(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("admin.access.pagePermissionsTitle")}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{t("admin.access.pagePermissionsDescription")}</p>
      </div>

      <label className="mb-4 block text-sm text-gray-700">
        {t("admin.access.wikiPage")}
        <select
          value={selectedPageId ?? ""}
          onChange={(event) => setSelectedPageId(event.target.value || null)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        >
          {pages.map((page) => (
            <option key={page.id} value={page.id}>
              {page.title}
            </option>
          ))}
        </select>
      </label>

      {selectedPage ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="font-medium text-gray-900">{selectedPage.title}</div>
            <div className="mt-1 text-xs text-gray-500">
              {t("admin.access.pageId", { id: selectedPage.id })}
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={inheritFromParent}
              onChange={(event) => setInheritFromParent(event.target.checked)}
            />
            {t("admin.access.inherit")}
          </label>

          <div className="space-y-2">
            {groups.map((group) => {
              const row = permissionRows.find((item) => item.groupId === group.id) ?? {
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
                        setPermissionRows((current) =>
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
                          setPermissionRows((current) =>
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
                          setPermissionRows((current) =>
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
                          setPermissionRows((current) =>
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
            onClick={savePermissions}
            disabled={isSavingPermissions}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {isSavingPermissions ? t("admin.access.saving") : t("admin.access.savePagePermissions")}
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
          {t("admin.access.noPages")}
        </div>
      )}
    </section>
  );
}
