"use client";

import { type AdminGroup, type CreateAdminGroupRequest, adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { ALL_GROUP_PERMISSIONS, type GroupPermission } from "@corp-internal/shared/contracts";
import { useEffect, useState } from "react";

/** Map "wiki.read" -> "permWikiRead" for i18n key lookup */
function permI18nKey(perm: GroupPermission): string {
  return `admin.access.perm${perm
    .split(".")
    .map((s) => (s[0] ?? "").toUpperCase() + s.slice(1))
    .join("")}`;
}

type GroupFormState = CreateAdminGroupRequest;

const emptyGroupForm: GroupFormState = {
  name: "",
  description: "",
  permissions: [],
};

type Props = {
  groups: AdminGroup[];
  onRefresh: () => Promise<void>;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

export function GroupManagementSection({ groups, onRefresh, setError, setNotice }: Props) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>(emptyGroupForm);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;

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
      await onRefresh();
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
      await onRefresh();
      setNotice(t("admin.access.groupDeleted"));
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, t("admin.access.groupDeleteError")));
    } finally {
      setIsSavingGroup(false);
    }
  };

  return (
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
              disabled={isSavingGroup || !groupForm.name.trim() || Boolean(selectedGroup?.isSystem)}
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
  );
}
