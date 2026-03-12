"use client";

import { authApi, usersApi, useAuthMeQuery } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const { data, isLoading, isError } = useAuthMeQuery();
  const user = data?.user ?? null;
  const authMode = data?.authMode ?? null;
  const t = useT();
  const formatters = useFormatters();
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: () => usersApi.listAuthSessions(),
    enabled: Boolean(user),
  });
  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => usersApi.revokeAuthSession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
    },
  });

  const handleRevokeSession = async (sessionId: string, current: boolean) => {
    await revokeSessionMutation.mutateAsync(sessionId);
    if (current) {
      router.push("/login");
      router.refresh();
    }
  };

  const handleLogout = async () => {
    if (authMode === "password") {
      await authApi.logout().catch(() => undefined);
      router.push("/login");
      router.refresh();
      return;
    }

    window.location.href = "/oauth2/sign_out";
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
            <p className="text-sm text-red-600">
              {t("settings.error")}
            </p>
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
                <h2 className="text-lg font-semibold text-gray-900">{t("settings.session")}</h2>
                <p className="mt-2 text-sm text-gray-600">
                  {t(sessionDescriptionKey)}
                </p>
                <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50">
                  {sessionsQuery.isLoading ? (
                    <p className="px-4 py-4 text-sm text-gray-500">{t("settings.sessionsLoading")}</p>
                  ) : sessionsQuery.isError ? (
                    <p className="px-4 py-4 text-sm text-red-600">{t("settings.sessionsError")}</p>
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
