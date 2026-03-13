"use client";

import {
  adminApi,
  type AdminGroup,
  type AdminUserRecord,
  type CreateAdminGroupRequest,
  type Page,
  wikiApi,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useStableEvent } from "@/lib/use-stable-event";
import { ALL_GROUP_PERMISSIONS, type GroupPermission } from "@corp-internal/shared/contracts";
import { useEffect, useState } from "react";

/** Map "wiki.read" → "permWikiRead" for i18n key lookup */
function permI18nKey(perm: GroupPermission): string {
  return `admin.access.perm${perm
    .split(".")
    .map((s) => (s[0] ?? "").toUpperCase() + s.slice(1))
    .join("")}`;
}

type GroupFormState = CreateAdminGroupRequest;

type PermissionDraftRow = {
  groupId: string;
  selected: boolean;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
};

const emptyGroupForm: GroupFormState = {
  name: "",
  description: "",
  permissions: [],
};

export default function AdminAccessPage() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>(emptyGroupForm);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [membershipDraft, setMembershipDraft] = useState<string[]>([]);
  const [permissionRows, setPermissionRows] = useState<PermissionDraftRow[]>([]);
  const [inheritFromParent, setInheritFromParent] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [isSavingMemberships, setIsSavingMemberships] = useState(false);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? null;

  const loadAdminData = useStableEvent(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [groupResult, userResult, pageResult] = await Promise.all([
        adminApi.listGroups(),
        adminApi.listUsers(),
        wikiApi.listPages(),
      ]);

      setGroups(groupResult.groups);
      setUsers(userResult.users);
      setPages(pageResult.pages);
      setSelectedGroupId((current) => current ?? groupResult.groups[0]?.id ?? null);
      setSelectedUserId((current) => current ?? userResult.users[0]?.id ?? null);
      setSelectedPageId((current) => current ?? pageResult.pages[0]?.id ?? null);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t("admin.access.loadError")));
    } finally {
      setIsLoading(false);
    }
  });

  const loadPagePermissions = useStableEvent(
    async (pageId: string, availableGroups: AdminGroup[]) => {
      try {
        const detail = await adminApi.getPagePermissions(pageId);
        setInheritFromParent(detail.inheritFromParent);
      setPermissionRows(
        availableGroups.map((group) => {
          const existing = detail.permissions.find((permission) => permission.groupId === group.id);
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
    void loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    if (!selectedGroup) {
      setGroupForm(emptyGroupForm);
      return;
    }

    setGroupForm({
      name: selectedGroup.name,
      description: selectedGroup.description ?? "",
      permissions: selectedGroup.permissions,
    });
  }, [selectedGroup]);

  useEffect(() => {
    if (!selectedUser) {
      setMembershipDraft([]);
      return;
    }

    setMembershipDraft(selectedUser.groups.map((group) => group.id));
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedPageId || groups.length === 0) {
      setPermissionRows([]);
      return;
    }

    void loadPagePermissions(selectedPageId, groups);
  }, [groups, loadPagePermissions, selectedPageId]);

  const refreshGroupsAndUsers = async () => {
    const [groupResult, userResult] = await Promise.all([adminApi.listGroups(), adminApi.listUsers()]);
    setGroups(groupResult.groups);
    setUsers(userResult.users);
    setSelectedGroupId((current) => {
      if (current && groupResult.groups.some((group) => group.id === current)) return current;
      return groupResult.groups[0]?.id ?? null;
    });
    setSelectedUserId((current) => {
      if (current && userResult.users.some((user) => user.id === current)) return current;
      return userResult.users[0]?.id ?? null;
    });
  };

  const submitGroup = async () => {
    setIsSavingGroup(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        ...groupForm,
        description: groupForm.description?.trim() || "",
      };

      if (selectedGroup && !selectedGroup.isSystem) {
        await adminApi.updateGroup(selectedGroup.id, payload);
        setNotice(t("admin.access.groupUpdated"));
      } else {
        const created = await adminApi.createGroup(payload);
        setSelectedGroupId(created.group.id);
        setNotice(t("admin.access.groupCreated"));
      }

      setShowGroupForm(false);
      await refreshGroupsAndUsers();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.access.groupSaveError")));
    } finally {
      setIsSavingGroup(false);
    }
  };

  const removeGroup = async () => {
    if (!selectedGroup || selectedGroup.isSystem) return;
    if (
      !window.confirm(
        t("admin.access.deleteConfirm", {
          name: selectedGroup.name,
        })
      )
    ) {
      return;
    }

    setIsSavingGroup(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.deleteGroup(selectedGroup.id);
      setSelectedGroupId(null);
      setGroupForm(emptyGroupForm);
      setShowGroupForm(false);
      await refreshGroupsAndUsers();
      setNotice(t("admin.access.groupDeleted"));
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, t("admin.access.groupDeleteError")));
    } finally {
      setIsSavingGroup(false);
    }
  };

  const saveMemberships = async () => {
    if (!selectedUser) return;

    setIsSavingMemberships(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.updateUserGroups(selectedUser.id, membershipDraft);
      await refreshGroupsAndUsers();
      setNotice(t("admin.access.membershipsUpdated"));
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.access.membershipsSaveError")));
    } finally {
      setIsSavingMemberships(false);
    }
  };

  const savePermissions = async () => {
    if (!selectedPageId) return;

    setIsSavingPermissions(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.setPagePermissions(selectedPageId, {
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
    <div className="space-y-6">
        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadAdminData()}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              {t("common.actions.retry")}
            </button>
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            {t("admin.access.loading")}
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-3">
            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{t("admin.access.groupsTitle")}</h2>
                  <p className="mt-1 text-sm text-gray-600">{t("admin.access.groupsDescription")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGroupId(null);
                    setGroupForm(emptyGroupForm);
                    setShowGroupForm(true);
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {t("admin.access.newGroup")}
                </button>
              </div>

              <div className="mb-5 space-y-2">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      setShowGroupForm(true);
                    }}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      group.id === selectedGroupId
                        ? "border-blue-300 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-gray-900">{group.name}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {group.description || t("admin.access.noDescription")}
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <div>{t("admin.access.memberCount", { count: group.memberCount })}</div>
                        <div>{group.isSystem ? t("admin.access.system") : t("admin.access.custom")}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {showGroupForm ? (
              <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">
                    {selectedGroup
                      ? t("admin.access.editGroup", { name: selectedGroup.name })
                      : t("admin.access.createGroup")}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowGroupForm(false)}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <label className="block text-sm text-gray-700">
                  {t("admin.access.name")}
                  <input
                    value={groupForm.name}
                    onChange={(event) =>
                      setGroupForm((current) => ({ ...current, name: event.target.value }))
                    }
                    disabled={selectedGroup?.isSystem}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  />
                </label>

                <label className="block text-sm text-gray-700">
                  {t("admin.access.descriptionLabel")}
                  <input
                    value={groupForm.description ?? ""}
                    onChange={(event) =>
                      setGroupForm((current) => ({ ...current, description: event.target.value }))
                    }
                    disabled={selectedGroup?.isSystem}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  />
                </label>

                <fieldset className="text-sm text-gray-700" disabled={selectedGroup?.isSystem}>
                  <legend className="mb-2 font-medium">{t("admin.access.permissionLabels")}</legend>
                  <div className="grid grid-cols-1 gap-1.5">
                    {ALL_GROUP_PERMISSIONS.map((perm) => (
                      <label
                        key={perm}
                        className="flex items-center gap-2 rounded border border-gray-200 px-2.5 py-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={groupForm.permissions.includes(perm)}
                          onChange={(event) =>
                            setGroupForm((current) => ({
                              ...current,
                              permissions: event.target.checked
                                ? [...current.permissions, perm]
                                : current.permissions.filter((p) => p !== perm),
                            }))
                          }
                        />
                        <span>
                          <span className="font-medium text-gray-900">{t(permI18nKey(perm))}</span>
                          <span className="ml-1.5 text-gray-400">{perm}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={submitGroup}
                    disabled={
                      isSavingGroup || !groupForm.name.trim() || Boolean(selectedGroup?.isSystem)
                    }
                    className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                  >
                    {isSavingGroup
                      ? t("admin.access.saving")
                      : selectedGroup
                        ? t("admin.access.updateGroup")
                        : t("admin.access.createGroupAction")}
                  </button>
                  {selectedGroup && !selectedGroup.isSystem ? (
                    <button
                      type="button"
                      onClick={removeGroup}
                      disabled={isSavingGroup}
                      className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      {t("admin.access.delete")}
                    </button>
                  ) : null}
                </div>
              </div>
              ) : null}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900">{t("admin.access.membershipsTitle")}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {t("admin.access.membershipsDescription")}
                </p>
              </div>

              <label className="mb-4 block text-sm text-gray-700">
                {t("admin.access.user")}
                <select
                  value={selectedUserId ?? ""}
                  onChange={(event) => setSelectedUserId(event.target.value || null)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </label>

              {selectedUser ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                    <div className="font-medium text-gray-900">{selectedUser.name}</div>
                    <div>{selectedUser.email}</div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">
                      {t("admin.access.role", { role: selectedUser.role })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {groups.map((group) => (
                      <label
                        key={group.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-medium text-gray-900">{group.name}</div>
                          <div className="text-xs text-gray-500">
                            {group.description || t("admin.access.noDescription")}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={membershipDraft.includes(group.id)}
                          onChange={(event) =>
                            setMembershipDraft((current) =>
                              event.target.checked
                                ? [...current, group.id]
                                : current.filter((item) => item !== group.id)
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={saveMemberships}
                    disabled={isSavingMemberships}
                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                  >
                    {isSavingMemberships
                      ? t("admin.access.saving")
                      : t("admin.access.saveMemberships")}
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                  {t("admin.access.noUsers")}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900">{t("admin.access.pagePermissionsTitle")}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {t("admin.access.pagePermissionsDescription")}
                </p>
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
                      const row =
                        permissionRows.find((item) => item.groupId === group.id) ?? {
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
                    {isSavingPermissions
                      ? t("admin.access.saving")
                      : t("admin.access.savePagePermissions")}
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                  {t("admin.access.noPages")}
                </div>
              )}
            </section>
          </div>
        )}
    </div>
  );
}
