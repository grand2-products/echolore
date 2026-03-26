"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorBanner } from "@/components/ui";
import { calendarApi, useCalendarStatusQuery } from "@/lib/api";
import { resolveAvatarSrc } from "@/lib/api/fetch";
import { usersApi } from "@/lib/api/users";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useAuthContext } from "@/lib/auth-context";
import { useAuthActions } from "@/lib/hooks/use-auth-actions";
import { useCurrentAuthSessions, useRevokeCurrentAuthSession } from "@/lib/hooks/use-auth-session";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import {
  type SupportedLocale,
  supportedLocales,
  useFormatters,
  useLocale,
  useSetLocale,
  useT,
} from "@/lib/i18n";
import { buildLoginUrl } from "@/lib/return-to";

export default function SettingsPage() {
  const { user, authMode, isLoading, isError, refetch: refetchAuth } = useAuthContext();
  const t = useT();
  const formatters = useFormatters();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const getApiErrorMessage = useApiErrorMessage();
  const router = useRouter();
  const { logout } = useAuthActions();
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    "default"
  );
  const sessionsQuery = useCurrentAuthSessions(Boolean(user));
  const revokeSessionMutation = useRevokeCurrentAuthSession();
  const calendarStatus = useCalendarStatusQuery(Boolean(user));
  const [calendarDisconnecting, setCalendarDisconnecting] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [avatarKey, setAvatarKey] = useState(0);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPermission(Notification.permission);
    } else {
      setNotifPermission("unsupported");
    }
  }, []);

  useMountEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const calendarParam = params.get("calendar");
    if (calendarParam === "connected") {
      setCalendarMessage(t("settings.calendar.connected"));
      void calendarStatus.refetch();
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    } else if (calendarParam === "error") {
      setCalendarMessage(t("settings.calendar.connectError"));
      window.history.replaceState({}, "", window.location.pathname);
    }
  });

  const handleCalendarDisconnect = async () => {
    setCalendarDisconnecting(true);
    setCalendarMessage(null);
    try {
      await calendarApi.disconnect();
      setCalendarMessage(t("settings.calendar.disconnected"));
      void calendarStatus.refetch();
    } catch {
      setCalendarMessage(t("settings.calendar.disconnectError"));
    } finally {
      setCalendarDisconnecting(false);
    }
  };

  const handleEnableNotifications = useCallback(async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
  }, []);

  const handleRevokeSession = async (sessionId: string, current: boolean) => {
    setRevokeError(null);
    try {
      await revokeSessionMutation.mutateAsync(sessionId);
      if (current) {
        await refetchAuth();
        router.push(buildLoginUrl("/settings"));
      }
    } catch (error) {
      setRevokeError(getApiErrorMessage(error, t("settings.sessionsError")));
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarMessage(null);
    try {
      await usersApi.uploadAvatar(file);
      setAvatarMessage(t("settings.avatar.uploadSuccess"));
      setAvatarKey((k) => k + 1);
      void refetchAuth();
    } catch (error) {
      setAvatarMessage(getApiErrorMessage(error, t("settings.avatar.uploadError")));
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarUploading(true);
    setAvatarMessage(null);
    try {
      await usersApi.deleteAvatar();
      setAvatarMessage(t("settings.avatar.removeSuccess"));
      setAvatarKey((k) => k + 1);
      void refetchAuth();
    } catch (error) {
      setAvatarMessage(getApiErrorMessage(error, t("settings.avatar.removeError")));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleNameEdit = () => {
    if (user) {
      setNameValue(user.name);
      setEditingName(true);
      setNameMessage(null);
    }
  };

  const handleNameSave = async () => {
    if (!user || !nameValue.trim()) return;
    setNameSaving(true);
    setNameMessage(null);
    try {
      await usersApi.update(user.id, { name: nameValue.trim() });
      setEditingName(false);
      setNameMessage(t("settings.nameUpdateSuccess"));
      void refetchAuth();
    } catch (error) {
      setNameMessage(getApiErrorMessage(error, t("settings.nameUpdateError")));
    } finally {
      setNameSaving(false);
    }
  };

  const handleNameCancel = () => {
    setEditingName(false);
    setNameMessage(null);
  };

  const avatarSrc = resolveAvatarSrc(user?.avatarUrl);
  const hasAvatar = avatarSrc !== null;

  const sessionDescriptionKey =
    authMode === "password"
      ? "settings.sessionDescriptionPassword"
      : authMode === "sso"
        ? "settings.sessionDescriptionSso"
        : "settings.sessionDescription";

  return (
    <div className="p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">{t("settings.title")}</h1>
        <p className="mb-8 text-gray-600">{t("settings.description")}</p>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {isLoading ? (
            <p className="text-sm text-gray-500">{t("settings.loading")}</p>
          ) : isError || !user ? (
            <div className="space-y-3">
              <p className="text-sm text-red-600">{t("settings.error")}</p>
              <button
                type="button"
                onClick={() => void refetchAuth()}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                {t("common.actions.retry")}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t("settings.account")}</h2>

                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-500">
                    {t("settings.avatar.title")}
                  </h3>
                  <p className="mt-1 text-xs text-gray-400">{t("settings.avatar.description")}</p>
                  <div className="mt-3 flex items-center gap-4">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-gray-200">
                      {hasAvatar ? (
                        <Image
                          key={avatarKey}
                          src={avatarSrc ?? ""}
                          alt=""
                          width={64}
                          height={64}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-gray-500">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <label
                        className={`rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 ${avatarUploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
                      >
                        {hasAvatar ? t("settings.avatar.change") : t("settings.avatar.upload")}
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          className="hidden"
                          onChange={(e) => void handleAvatarUpload(e)}
                          disabled={avatarUploading}
                        />
                      </label>
                      {hasAvatar && (
                        <button
                          type="button"
                          onClick={() => void handleAvatarRemove()}
                          disabled={avatarUploading}
                          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          {t("settings.avatar.remove")}
                        </button>
                      )}
                    </div>
                  </div>
                  {avatarMessage && <p className="mt-2 text-sm text-blue-600">{avatarMessage}</p>}
                </div>

                <dl className="mt-6 space-y-3 text-sm text-gray-700">
                  <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3">
                    <dt className="font-medium text-gray-500">{t("settings.name")}</dt>
                    <dd className="flex items-center gap-2">
                      {editingName ? (
                        <>
                          <input
                            type="text"
                            value={nameValue}
                            onChange={(e) => setNameValue(e.target.value)}
                            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleNameSave();
                              if (e.key === "Escape") handleNameCancel();
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => void handleNameSave()}
                            disabled={nameSaving || !nameValue.trim()}
                            className="rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                          >
                            {t("settings.editNameSave")}
                          </button>
                          <button
                            type="button"
                            onClick={handleNameCancel}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                          >
                            {t("settings.editNameCancel")}
                          </button>
                        </>
                      ) : (
                        <>
                          <span>{user.name}</span>
                          <button
                            type="button"
                            onClick={handleNameEdit}
                            className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                          >
                            {t("settings.editName")}
                          </button>
                        </>
                      )}
                    </dd>
                  </div>
                  {nameMessage && <p className="text-sm text-blue-600">{nameMessage}</p>}
                  <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3">
                    <dt className="font-medium text-gray-500">{t("settings.email")}</dt>
                    <dd>{user.email}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="font-medium text-gray-500">{t("settings.role")}</dt>
                    <dd>{formatters.role(user.role)}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t("settings.language")}</h2>
                <p className="mt-2 text-sm text-gray-600">{t("settings.languageDescription")}</p>
                <select
                  value={locale}
                  onChange={(event) => setLocale(event.target.value as SupportedLocale)}
                  className="mt-3 rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {supportedLocales.map((option) => (
                    <option key={option} value={option}>
                      {t(`common.language.${option}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t("settings.session")}</h2>
                <p className="mt-2 text-sm text-gray-600">{t(sessionDescriptionKey)}</p>
                {revokeError ? <ErrorBanner message={revokeError} className="mt-3" /> : null}
                <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50">
                  {sessionsQuery.isLoading ? (
                    <p className="px-4 py-4 text-sm text-gray-500">
                      {t("settings.sessionsLoading")}
                    </p>
                  ) : sessionsQuery.isError ? (
                    <div className="space-y-3 px-4 py-4">
                      <p className="text-sm text-red-600">
                        {getApiErrorMessage(sessionsQuery.error, t("settings.sessionsError"))}
                      </p>
                      <button
                        type="button"
                        onClick={() => void sessionsQuery.refetch()}
                        className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                      >
                        {t("common.actions.retry")}
                      </button>
                    </div>
                  ) : sessionsQuery.data?.sessions.length ? (
                    <ul className="divide-y divide-gray-200">
                      {sessionsQuery.data.sessions.map((session) => (
                        <li
                          key={session.id}
                          className="flex items-center justify-between gap-4 px-4 py-4"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {session.deviceName || t("settings.deviceUnknown")}
                              {session.current ? (
                                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                  {t("settings.currentSession")}
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {t("settings.sessionMeta", {
                                clientType: formatters.clientType(session.clientType),
                                authMode: formatters.authMode(session.authMode),
                              })}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {t("settings.sessionExpiry", {
                                value: formatters.dateTime(session.expiresAt),
                              })}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRevokeSession(session.id, session.current)}
                            disabled={revokeSessionMutation.isPending}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {session.current
                              ? t("settings.revokeCurrentSession")
                              : t("settings.revokeSession")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-4 text-sm text-gray-500">{t("settings.noSessions")}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                >
                  {t("common.nav.logout")}
                </button>
              </div>

              {notifPermission !== "unsupported" && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {t("settings.notifications")}
                  </h2>
                  <p className="mt-2 text-sm text-gray-600">
                    {t("settings.notificationsDescription")}
                  </p>
                  <div className="mt-3">
                    {notifPermission === "granted" ? (
                      <p className="text-sm text-emerald-600">
                        {t("settings.notificationsEnabled")}
                      </p>
                    ) : notifPermission === "denied" ? (
                      <p className="text-sm text-red-600">{t("settings.notificationsBlocked")}</p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleEnableNotifications()}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                      >
                        {t("settings.notificationsEnable")}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {t("settings.calendar.title")}
                </h2>
                <p className="mt-2 text-sm text-gray-600">{t("settings.calendar.description")}</p>
                {calendarMessage && (
                  <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                    {calendarMessage}
                  </p>
                )}
                <div className="mt-3">
                  {calendarStatus.isLoading ? (
                    <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
                  ) : calendarStatus.data?.connected ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-emerald-600">
                        {t("settings.calendar.statusConnected")}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCalendarDisconnect()}
                        disabled={calendarDisconnecting}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                      >
                        {t("settings.calendar.disconnect")}
                      </button>
                    </div>
                  ) : (
                    <a
                      href={calendarApi.getConnectUrl()}
                      className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                      {t("settings.calendar.connect")}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
