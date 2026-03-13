"use client";

import { useApiErrorMessage } from "@/lib/api-error-message";
import { useAuthContext } from "@/lib/auth-context";
import { supportedLocales, useFormatters, useLocale, useSetLocale, useT, type SupportedLocale } from "@/lib/i18n";
import { useAuthActions } from "@/lib/use-auth-actions";
import {
  useCurrentAuthSessions,
  useRevokeCurrentAuthSession,
} from "@/lib/use-auth-session";
import { buildLoginUrl } from "@/lib/return-to";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const sessionsQuery = useCurrentAuthSessions(Boolean(user));
  const revokeSessionMutation = useRevokeCurrentAuthSession();

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
        <p className="mb-8 text-gray-600">
          {t("settings.description")}
        </p>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {isLoading ? (
            <p className="text-sm text-gray-500">{t("settings.loading")}</p>
          ) : isError || !user ? (
            <div className="space-y-3">
              <p className="text-sm text-red-600">
                {t("settings.error")}
              </p>
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
                <dl className="mt-4 space-y-3 text-sm text-gray-700">
                  <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3">
                    <dt className="font-medium text-gray-500">{t("settings.name")}</dt>
                    <dd>{user.name}</dd>
                  </div>
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
                <p className="mt-2 text-sm text-gray-600">
                  {t("settings.languageDescription")}
                </p>
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
                <p className="mt-2 text-sm text-gray-600">
                  {t(sessionDescriptionKey)}
                </p>
                {revokeError ? (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {revokeError}
                  </p>
                ) : null}
                <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50">
                  {sessionsQuery.isLoading ? (
                    <p className="px-4 py-4 text-sm text-gray-500">{t("settings.sessionsLoading")}</p>
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
                        <li key={session.id} className="flex items-center justify-between gap-4 px-4 py-4">
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
                              {t("settings.sessionExpiry", { value: formatters.dateTime(session.expiresAt) })}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRevokeSession(session.id, session.current)}
                            disabled={revokeSessionMutation.isPending}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {session.current ? t("settings.revokeCurrentSession") : t("settings.revokeSession")}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
