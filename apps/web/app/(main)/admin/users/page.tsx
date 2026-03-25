"use client";

import type { UserInvitationDto } from "@echolore/shared/contracts";
import Image from "next/image";
import { useRef, useState } from "react";
import { ModalShell } from "@/components/wiki/ModalShell";
import { type AdminUserRecord, adminApi } from "@/lib/api";
import { buildApiUrl } from "@/lib/api/fetch";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useAsyncData } from "@/lib/hooks/use-async-data";
import { useFormatters, useT } from "@/lib/i18n";

const isValidImageUrl = (url: string | null | undefined): url is string => {
  if (!url) return false;
  if (url.startsWith("/api/users/")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export default function AdminUsersPage() {
  const t = useT();
  const { date } = useFormatters();
  const getApiErrorMessage = useApiErrorMessage();
  const {
    data: users,
    isLoading,
    error,
    refetch: loadUsers,
  } = useAsyncData<AdminUserRecord[]>([], async () => {
    const response = await adminApi.listUsers();
    return response.users;
  });
  const { data: invitations, refetch: loadInvitations } = useAsyncData<UserInvitationDto[]>(
    [],
    async () => {
      const response = await adminApi.listInvitations();
      return response.invitations;
    }
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  // Invite form state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "suspend" | "delete";
    userId: string;
    userName: string;
  } | null>(null);

  const displayError = error ?? actionError;

  const handleRoleChange = async (userId: string, newRole: "admin" | "member") => {
    setChangingRoleId(userId);
    setNotice(null);
    setActionError(null);
    try {
      await adminApi.updateUserRole(userId, newRole);
      setNotice(t("admin.users.roleUpdated"));
      await loadUsers();
    } catch (saveError) {
      setActionError(getApiErrorMessage(saveError, t("admin.users.roleUpdateError")));
    } finally {
      setChangingRoleId(null);
    }
  };

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsInviting(true);
    setNotice(null);
    setActionError(null);
    setInviteUrl(null);
    try {
      const result = await adminApi.createInvitation({
        email: inviteEmail,
        role: inviteRole,
      });
      if (result.emailSent) {
        setNotice(t("admin.users.inviteSent"));
      } else {
        setInviteUrl(result.inviteUrl);
      }
      setInviteEmail("");
      setShowInviteForm(false);
      await loadInvitations();
    } catch (inviteError) {
      setActionError(getApiErrorMessage(inviteError, t("admin.users.inviteError")));
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevoke = async (invitationId: string) => {
    setNotice(null);
    setActionError(null);
    try {
      await adminApi.revokeInvitation(invitationId);
      setNotice(t("admin.users.inviteRevoked"));
      await loadInvitations();
    } catch (revokeError) {
      setActionError(getApiErrorMessage(revokeError, t("admin.users.inviteRevokeError")));
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setInviteLinkCopied(true);
    clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setInviteLinkCopied(false), 2000);
  };

  const closeInviteModal = () => {
    setInviteUrl(null);
    setInviteLinkCopied(false);
    clearTimeout(copiedTimerRef.current);
  };

  const handleSuspend = async (userId: string) => {
    setActingOnId(userId);
    setNotice(null);
    setActionError(null);
    try {
      await adminApi.suspendUser(userId);
      setNotice(t("admin.users.userSuspended"));
      await loadUsers();
    } catch (err) {
      setActionError(getApiErrorMessage(err, t("admin.users.suspendError")));
    } finally {
      setActingOnId(null);
      setConfirmAction(null);
    }
  };

  const handleUnsuspend = async (userId: string) => {
    setActingOnId(userId);
    setNotice(null);
    setActionError(null);
    try {
      await adminApi.unsuspendUser(userId);
      setNotice(t("admin.users.userUnsuspended"));
      await loadUsers();
    } catch (err) {
      setActionError(getApiErrorMessage(err, t("admin.users.unsuspendError")));
    } finally {
      setActingOnId(null);
    }
  };

  const handleDelete = async (userId: string) => {
    setActingOnId(userId);
    setNotice(null);
    setActionError(null);
    try {
      await adminApi.deleteUser(userId);
      setNotice(t("admin.users.userDeleted"));
      await loadUsers();
    } catch (err) {
      setActionError(getApiErrorMessage(err, t("admin.users.deleteError")));
    } finally {
      setActingOnId(null);
      setConfirmAction(null);
    }
  };

  const handleRestore = async (userId: string) => {
    setActingOnId(userId);
    setNotice(null);
    setActionError(null);
    try {
      await adminApi.restoreUser(userId);
      setNotice(t("admin.users.userRestored"));
      await loadUsers();
    } catch (err) {
      setActionError(getApiErrorMessage(err, t("admin.users.restoreError")));
    } finally {
      setActingOnId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
        {t("admin.users.loading")}
      </div>
    );
  }

  const pendingInvitations = invitations.filter(
    (inv) => !inv.usedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date()
  );

  return (
    <div>
      {displayError ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{displayError}</span>
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
      <ModalShell open={!!inviteUrl} onClose={closeInviteModal}>
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          {t("admin.users.inviteLinkLabel")}
        </h3>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={inviteUrl ?? ""}
            className="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            type="button"
            onClick={() => inviteUrl && copyToClipboard(inviteUrl)}
            className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {inviteLinkCopied ? t("admin.users.inviteLinkCopied") : t("admin.users.copyLink")}
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={closeInviteModal}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("common.actions.close")}
          </button>
        </div>
      </ModalShell>

      {/* Invite button + form */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">{t("admin.users.title")}</h2>
        <button
          type="button"
          onClick={() => setShowInviteForm(!showInviteForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t("admin.users.inviteUser")}
        </button>
      </div>

      {showInviteForm ? (
        <form
          onSubmit={handleInvite}
          className="mb-4 rounded-xl border border-gray-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <label
                htmlFor="invite-email"
                className="mb-1 block text-xs font-medium text-gray-600"
              >
                {t("admin.users.email")}
              </label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="invite-role" className="mb-1 block text-xs font-medium text-gray-600">
                {t("admin.users.role")}
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="member">{t("admin.users.roleMember")}</option>
                <option value="admin">{t("admin.users.roleAdmin")}</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={isInviting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isInviting ? t("admin.users.inviting") : t("admin.users.sendInvite")}
            </button>
            <button
              type="button"
              onClick={() => setShowInviteForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t("common.actions.cancel")}
            </button>
          </div>
        </form>
      ) : null}

      {/* Pending invitations */}
      {pendingInvitations.length > 0 ? (
        <div className="mb-4 overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
          <div className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-amber-700">
            {t("admin.users.pendingInvitations")} ({pendingInvitations.length})
          </div>
          <table className="min-w-full divide-y divide-amber-200">
            <tbody className="divide-y divide-amber-100">
              {pendingInvitations.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-2 text-sm text-gray-700">{inv.email}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                        inv.role === "admin"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-gray-200 bg-gray-50 text-gray-700"
                      }`}
                    >
                      {inv.role === "admin"
                        ? t("admin.users.roleAdmin")
                        : t("admin.users.roleMember")}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {t("admin.users.expiresAt")} {date(inv.expiresAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void handleRevoke(inv.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      {t("admin.users.revoke")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                {t("admin.users.status")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("admin.users.createdAt")}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                {t("admin.users.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => {
              const isSuspended = !!user.suspendedAt;
              const isDeleted = !!user.deletedAt;
              const isBusy = actingOnId === user.id;
              return (
                <tr
                  key={user.id}
                  className={
                    isDeleted
                      ? "bg-gray-50 opacity-60"
                      : isSuspended
                        ? "bg-amber-50/40"
                        : "hover:bg-gray-50"
                  }
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isValidImageUrl(user.avatarUrl) ? (
                        <Image
                          src={
                            user.avatarUrl.startsWith("/api/")
                              ? buildApiUrl(user.avatarUrl)
                              : user.avatarUrl
                          }
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
                      <span
                        className={`text-sm font-medium ${isDeleted ? "text-gray-400 line-through" : "text-gray-900"}`}
                      >
                        {user.name}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {user.email}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <select
                      value={user.role}
                      disabled={changingRoleId === user.id || isDeleted}
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
                  <td className="whitespace-nowrap px-4 py-3">
                    {isDeleted ? (
                      <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        {t("admin.users.deleted")}
                      </span>
                    ) : isSuspended ? (
                      <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        {t("admin.users.suspended")}
                      </span>
                    ) : (
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {t("admin.users.active")}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                    {date(user.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isDeleted ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleRestore(user.id)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60"
                        >
                          {t("admin.users.restore")}
                        </button>
                      ) : (
                        <>
                          {isSuspended ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleUnsuspend(user.id)}
                              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-60"
                            >
                              {t("admin.users.unsuspend")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                setConfirmAction({
                                  type: "suspend",
                                  userId: user.id,
                                  userName: user.name,
                                })
                              }
                              className="text-xs font-medium text-amber-600 hover:text-amber-700 disabled:opacity-60"
                            >
                              {t("admin.users.suspend")}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              setConfirmAction({
                                type: "delete",
                                userId: user.id,
                                userName: user.name,
                              })
                            }
                            className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
                          >
                            {t("admin.users.delete")}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                  {t("admin.users.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ModalShell open={!!confirmAction} onClose={() => setConfirmAction(null)}>
        {confirmAction && (
          <>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              {confirmAction.type === "suspend"
                ? t("admin.users.suspendConfirm")
                : t("admin.users.deleteConfirm")}
            </h3>
            <p className="mb-4 text-sm text-gray-600">{confirmAction.userName}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("common.actions.cancel")}
              </button>
              <button
                type="button"
                disabled={!!actingOnId}
                onClick={() =>
                  void (confirmAction.type === "suspend"
                    ? handleSuspend(confirmAction.userId)
                    : handleDelete(confirmAction.userId))
                }
                className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  confirmAction.type === "suspend"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {confirmAction.type === "suspend"
                  ? t("admin.users.suspend")
                  : t("admin.users.delete")}
              </button>
            </div>
          </>
        )}
      </ModalShell>
    </div>
  );
}
