"use client";

import {
  adminApi,
  type AdminGroup,
  type AdminUserRecord,
  type CreateAdminGroupRequest,
  type Page,
  wikiApi,
} from "@/lib/api";
import { useEffect, useEffectEvent, useState } from "react";

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

function parsePermissions(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatPermissions(value: string[]) {
  return value.join(", ");
}

export default function AdminAccessPage() {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>(emptyGroupForm);
  const [permissionText, setPermissionText] = useState("");
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

  const loadAdminData = useEffectEvent(async () => {
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
      setError(loadError instanceof Error ? loadError.message : "Failed to load admin access data");
    } finally {
      setIsLoading(false);
    }
  });

  const loadPagePermissions = useEffectEvent(async (pageId: string, availableGroups: AdminGroup[]) => {
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
      setError(loadError instanceof Error ? loadError.message : "Failed to load page permissions");
    }
  });

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    if (!selectedGroup) {
      setGroupForm(emptyGroupForm);
      setPermissionText("");
      return;
    }

    setGroupForm({
      name: selectedGroup.name,
      description: selectedGroup.description ?? "",
      permissions: selectedGroup.permissions,
    });
    setPermissionText(formatPermissions(selectedGroup.permissions));
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
        permissions: parsePermissions(permissionText),
      };

      if (selectedGroup && !selectedGroup.isSystem) {
        await adminApi.updateGroup(selectedGroup.id, payload);
        setNotice("Group updated.");
      } else {
        const created = await adminApi.createGroup(payload);
        setSelectedGroupId(created.group.id);
        setNotice("Group created.");
      }

      await refreshGroupsAndUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save group");
    } finally {
      setIsSavingGroup(false);
    }
  };

  const removeGroup = async () => {
    if (!selectedGroup || selectedGroup.isSystem) return;

    setIsSavingGroup(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.deleteGroup(selectedGroup.id);
      setSelectedGroupId(null);
      setGroupForm(emptyGroupForm);
      setPermissionText("");
      await refreshGroupsAndUsers();
      setNotice("Group deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete group");
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
      setNotice("User memberships updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update memberships");
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
      setNotice("Page permissions updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update page permissions");
    } finally {
      setIsSavingPermissions(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Access</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage groups, user memberships, and wiki page permissions from one place.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            Loading access controls...
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-3">
            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Groups</h2>
                  <p className="mt-1 text-sm text-gray-600">Create and maintain permission groups.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGroupId(null);
                    setGroupForm(emptyGroupForm);
                    setPermissionText("");
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  New group
                </button>
              </div>

              <div className="mb-5 space-y-2">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
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
                          {group.description || "No description"}
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <div>{group.memberCount} members</div>
                        <div>{group.isSystem ? "system" : "custom"}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="font-semibold text-gray-900">
                  {selectedGroup ? `Edit ${selectedGroup.name}` : "Create group"}
                </h3>

                <label className="block text-sm text-gray-700">
                  Name
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
                  Description
                  <input
                    value={groupForm.description ?? ""}
                    onChange={(event) =>
                      setGroupForm((current) => ({ ...current, description: event.target.value }))
                    }
                    disabled={selectedGroup?.isSystem}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  />
                </label>

                <label className="block text-sm text-gray-700">
                  Permission labels
                  <input
                    value={permissionText}
                    onChange={(event) => setPermissionText(event.target.value)}
                    disabled={selectedGroup?.isSystem}
                    placeholder="wiki.read, wiki.write"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  />
                </label>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={submitGroup}
                    disabled={
                      isSavingGroup || !groupForm.name.trim() || Boolean(selectedGroup?.isSystem)
                    }
                    className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                  >
                    {isSavingGroup ? "Saving..." : selectedGroup ? "Update group" : "Create group"}
                  </button>
                  {selectedGroup && !selectedGroup.isSystem ? (
                    <button
                      type="button"
                      onClick={removeGroup}
                      disabled={isSavingGroup}
                      className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Memberships</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Assign users to groups without leaving the admin shell.
                </p>
              </div>

              <label className="mb-4 block text-sm text-gray-700">
                User
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
                      role: {selectedUser.role}
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
                          <div className="text-xs text-gray-500">{group.description || "No description"}</div>
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
                    {isSavingMemberships ? "Saving..." : "Save memberships"}
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                  No users available.
                </div>
              )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Page Permissions</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Replace page-level access rules and inheritance defaults.
                </p>
              </div>

              <label className="mb-4 block text-sm text-gray-700">
                Wiki page
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
                    <div className="mt-1 text-xs text-gray-500">page id: {selectedPage.id}</div>
                  </div>

                  <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={inheritFromParent}
                      onChange={(event) => setInheritFromParent(event.target.checked)}
                    />
                    Inherit permissions from parent
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
                                {group.description || "No description"}
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
                              Read
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
                              Write
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
                              Delete
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
                    {isSavingPermissions ? "Saving..." : "Save page permissions"}
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                  No wiki pages available.
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
