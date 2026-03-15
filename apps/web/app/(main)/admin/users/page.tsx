"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { type AdminUserRecord, adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useStableEvent } from "@/lib/hooks/use-stable-event";
import { useFormatters, useT } from "@/lib/i18n";

export default function AdminUsersPage() {
  const t = useT();
  const { date } = useFormatters();
  const getApiErrorMessage = useApiErrorMessage();
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  const loadUsers = useStableEvent(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminApi.listUsers();
      setUsers(response.users);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t("admin.users.loadError")));
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (userId: string, newRole: "admin" | "member") => {
    setChangingRoleId(userId);
    setError(null);
    setNotice(null);
    try {
      const updated = await adminApi.updateUserRole(userId, newRole);
      setUsers((current) =>
        current.map((u) => (u.id === userId ? { ...u, role: updated.user?.role ?? newRole } : u))
      );
      setNotice(t("admin.users.roleUpdated"));
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.users.roleUpdateError")));
    } finally {
      setChangingRoleId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
        {t("admin.users.loading")}
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            {t("common.actions.retry")}
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("admin.users.name")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("admin.users.email")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("admin.users.role")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("admin.users.groups")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("admin.users.createdAt")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2">
                    {user.avatarUrl ? (
                      <Image
                        src={user.avatarUrl}
                        alt=""
                        width={28}
                        height={28}
                        unoptimized
                        className="h-7 w-7 rounded-full"
                      />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
                        {user.name.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-900">{user.name}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{user.email}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <select
                    value={user.role}
                    disabled={changingRoleId === user.id}
                    onChange={(event) =>
                      void handleRoleChange(user.id, event.target.value as "admin" | "member")
                    }
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${
                      user.role === "admin"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-gray-200 bg-gray-50 text-gray-700"
                    } disabled:opacity-60`}
                  >
                    <option value="admin">{t("admin.users.roleAdmin")}</option>
                    <option value="member">{t("admin.users.roleMember")}</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {user.groups.length > 0 ? (
                      user.groups.map((group) => (
                        <span
                          key={group.id}
                          className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                        >
                          {group.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                  {date(user.createdAt)}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                  {t("admin.users.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
