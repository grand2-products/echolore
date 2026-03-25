"use client";

import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ModalShell } from "@/components/wiki/ModalShell";
import { type AdminGroup, type AdminUserRecord, adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";

interface UserDetailModalProps {
  user: AdminUserRecord | null;
  groups: AdminGroup[];
  onClose: () => void;
  onUpdated: () => void;
}

export function UserDetailModal({ user, groups, onClose, onUpdated }: UserDetailModalProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [membershipDraft, setMembershipDraft] = useState<string[]>([]);
  const [isSavingGroups, setIsSavingGroups] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"suspend" | "delete" | null>(null);

  const userId = user?.id ?? null;
  const userGroupIds = user?.groups.map((g) => g.id).join(",") ?? "";

  // Reset UI state when switching to a different user
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on userId change
  useEffect(() => {
    setNotice(null);
    setError(null);
    setConfirmAction(null);
  }, [userId]);

  // Sync membership draft when user or their groups change
  useEffect(() => {
    setMembershipDraft(userGroupIds ? userGroupIds.split(",") : []);
  }, [userGroupIds]);

  if (!user) return null;

  const isSuspended = !!user.suspendedAt;
  const isDeleted = !!user.deletedAt;

  const executeAction = async (
    action: () => Promise<unknown>,
    successKey: string,
    errorKey: string,
    clearConfirm = false
  ) => {
    setIsActing(true);
    setNotice(null);
    setError(null);
    try {
      await action();
      setNotice(t(successKey));
      if (clearConfirm) setConfirmAction(null);
      onUpdated();
    } catch (err) {
      setError(getApiErrorMessage(err, t(errorKey)));
    } finally {
      setIsActing(false);
    }
  };

  const handleRoleChange = (newRole: "admin" | "member") =>
    executeAction(
      () => adminApi.updateUserRole(user.id, newRole),
      "admin.users.roleUpdated",
      "admin.users.roleUpdateError"
    );

  const handleSaveGroups = async () => {
    setIsSavingGroups(true);
    setNotice(null);
    setError(null);
    try {
      await adminApi.updateUserGroups(user.id, membershipDraft);
      setNotice(t("admin.users.groupsUpdated"));
      onUpdated();
    } catch (err) {
      setError(getApiErrorMessage(err, t("admin.users.groupsUpdateError")));
    } finally {
      setIsSavingGroups(false);
    }
  };

  return (
    <ModalShell open={!!user} onClose={onClose} maxWidth="max-w-lg">
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <UserAvatar avatarUrl={user.avatarUrl} name={user.name} size={40} />
        <div>
          <div className="font-semibold text-gray-900">{user.name}</div>
          <div className="text-sm text-gray-500">{user.email}</div>
        </div>
      </div>

      {/* Role */}
      <div className="mb-4">
        <label htmlFor="user-role-select" className="mb-1 block text-xs font-medium text-gray-600">
          {t("admin.users.role")}
        </label>
        <select
          id="user-role-select"
          value={user.role}
          disabled={isDeleted}
          onChange={(e) => void handleRoleChange(e.target.value as "admin" | "member")}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            user.role === "admin"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-gray-200 bg-gray-50 text-gray-700"
          } disabled:opacity-60`}
        >
          <option value="admin">{t("admin.users.roleAdmin")}</option>
          <option value="member">{t("admin.users.roleMember")}</option>
        </select>
      </div>

      {/* Group memberships */}
      <div className="mb-4">
        <h3 className="mb-2 text-xs font-medium text-gray-600">
          {t("admin.users.groupMemberships")}
        </h3>
        {groups.length > 0 ? (
          <div className="max-h-48 space-y-1.5 overflow-y-auto">
            {groups.map((group) => (
              <label
                key={group.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-gray-900">{group.name}</div>
                  {group.description && (
                    <div className="text-xs text-gray-500">{group.description}</div>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={membershipDraft.includes(group.id)}
                  onChange={(e) =>
                    setMembershipDraft((prev) =>
                      e.target.checked ? [...prev, group.id] : prev.filter((id) => id !== group.id)
                    )
                  }
                />
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">{t("admin.users.noGroups")}</p>
        )}
        <button
          type="button"
          onClick={() => void handleSaveGroups()}
          disabled={isSavingGroups}
          className="mt-2 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {isSavingGroups ? t("admin.users.savingGroups") : t("admin.users.saveGroups")}
        </button>
      </div>

      {/* Actions */}
      <div className="border-t border-gray-200 pt-4">
        {confirmAction ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              {confirmAction === "suspend"
                ? t("admin.users.suspendConfirm")
                : t("admin.users.deleteConfirm")}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("common.actions.cancel")}
              </button>
              <button
                type="button"
                disabled={isActing}
                onClick={() =>
                  void executeAction(
                    () =>
                      confirmAction === "suspend"
                        ? adminApi.suspendUser(user.id)
                        : adminApi.deleteUser(user.id),
                    confirmAction === "suspend"
                      ? "admin.users.userSuspended"
                      : "admin.users.userDeleted",
                    confirmAction === "suspend"
                      ? "admin.users.suspendError"
                      : "admin.users.deleteError",
                    true
                  )
                }
                className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 ${
                  confirmAction === "suspend"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {confirmAction === "suspend" ? t("admin.users.suspend") : t("admin.users.delete")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {isDeleted ? (
              <button
                type="button"
                disabled={isActing}
                onClick={() =>
                  void executeAction(
                    () => adminApi.restoreUser(user.id),
                    "admin.users.userRestored",
                    "admin.users.restoreError"
                  )
                }
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {t("admin.users.restore")}
              </button>
            ) : (
              <>
                {isSuspended ? (
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={() =>
                      void executeAction(
                        () => adminApi.unsuspendUser(user.id),
                        "admin.users.userUnsuspended",
                        "admin.users.unsuspendError"
                      )
                    }
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {t("admin.users.unsuspend")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={() => setConfirmAction("suspend")}
                    className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                  >
                    {t("admin.users.suspend")}
                  </button>
                )}
                <button
                  type="button"
                  disabled={isActing}
                  onClick={() => setConfirmAction("delete")}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {t("admin.users.delete")}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
