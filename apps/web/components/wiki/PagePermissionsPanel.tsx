"use client";

import { useEffect, useState } from "react";
import { wikiApi, type AdminGroup, type AdminPagePermissionRecord } from "@/lib/api";
import { useT } from "@/lib/i18n";

interface PagePermissionsPanelProps {
  pageId: string;
  onClose: () => void;
}

type PermissionRow = {
  groupId: string;
  selected: boolean;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
};

export function PagePermissionsPanel({ pageId, onClose }: PagePermissionsPanelProps) {
  const t = useT();
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [inheritFromParent, setInheritFromParent] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    Promise.all([wikiApi.listGroups(), wikiApi.getPagePermissions(pageId)])
      .then(([groupRes, permRes]) => {
        setGroups(groupRes.groups);
        setInheritFromParent(permRes.inheritFromParent);
        setRows(
          groupRes.groups.map((group) => {
            const existing = permRes.permissions.find(
              (p: AdminPagePermissionRecord) => p.groupId === group.id,
            );
            return {
              groupId: group.id,
              selected: Boolean(existing),
              canRead: existing?.canRead ?? true,
              canWrite: existing?.canWrite ?? false,
              canDelete: existing?.canDelete ?? false,
            };
          }),
        );
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : t("wiki.permissions.loadError")),
      )
      .finally(() => setIsLoading(false));
  }, [pageId, t]);

  const save = async () => {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await wikiApi.setPagePermissions(pageId, {
        inheritFromParent,
        permissions: rows
          .filter((r) => r.selected)
          .map((r) => ({
            groupId: r.groupId,
            canRead: r.canRead,
            canWrite: r.canWrite,
            canDelete: r.canDelete,
          })),
      });
      setNotice(t("wiki.permissions.saved"));
      setTimeout(() => setNotice(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wiki.permissions.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[55] flex w-80 flex-col border-l border-gray-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {t("wiki.permissions.title")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          X
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
        </div>
      ) : error ? (
        <div className="p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          {notice && (
            <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">
              {notice}
            </div>
          )}

          <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={inheritFromParent}
              onChange={(e) => setInheritFromParent(e.target.checked)}
            />
            {t("wiki.permissions.inherit")}
          </label>

          <div className="space-y-3">
            {groups.map((group) => {
              const row = rows.find((r) => r.groupId === group.id) ?? {
                groupId: group.id,
                selected: false,
                canRead: true,
                canWrite: false,
                canDelete: false,
              };

              return (
                <div
                  key={group.id}
                  className="rounded-lg border border-gray-200 p-3"
                >
                  <label className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-gray-900">
                      {group.name}
                    </span>
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(e) =>
                        setRows((cur) =>
                          cur.map((r) =>
                            r.groupId === group.id
                              ? { ...r, selected: e.target.checked }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>

                  <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-gray-600">
                    {(["canRead", "canWrite", "canDelete"] as const).map(
                      (field) => (
                        <label
                          key={field}
                          className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1.5"
                        >
                          <input
                            type="checkbox"
                            checked={row[field]}
                            disabled={!row.selected}
                            onChange={(e) =>
                              setRows((cur) =>
                                cur.map((r) =>
                                  r.groupId === group.id
                                    ? { ...r, [field]: e.target.checked }
                                    : r,
                                ),
                              )
                            }
                          />
                          {t(`wiki.permissions.${field}`)}
                        </label>
                      ),
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {isSaving ? t("common.status.loading") : t("wiki.permissions.save")}
          </button>
        </div>
      )}
    </div>
  );
}
