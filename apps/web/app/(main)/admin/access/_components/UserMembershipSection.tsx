"use client";

import {
  adminApi,
  type AdminGroup,
  type AdminUserRecord,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useState, useEffect } from "react";

type Props = {
  groups: AdminGroup[];
  users: AdminUserRecord[];
  onRefresh: () => Promise<void>;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

export function UserMembershipSection({ groups, users, onRefresh, setError, setNotice }: Props) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [membershipDraft, setMembershipDraft] = useState<string[]>([]);
  const [isSavingMemberships, setIsSavingMemberships] = useState(false);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  // Auto-select first user
  useEffect(() => {
    setSelectedUserId((current) => current ?? users[0]?.id ?? null);
  }, [users]);

  useEffect(() => {
    if (!selectedUser) {
      setMembershipDraft([]);
      return;
    }

    setMembershipDraft(selectedUser.groups.map((group) => group.id));
  }, [selectedUser]);

  const saveMemberships = async () => {
    if (!selectedUser) return;

    setIsSavingMemberships(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.updateUserGroups(selectedUser.id, membershipDraft);
      await onRefresh();
      setNotice(t("admin.access.membershipsUpdated"));
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.access.membershipsSaveError")));
    } finally {
      setIsSavingMemberships(false);
    }
  };

  return (
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
  );
}
