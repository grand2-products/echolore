"use client";

import { CoworkingFloatingBar } from "@/components/coworking/floating-bar";
import { Header, Sidebar } from "@/components/layout";
import { FloatingChat } from "@/components/wiki-chat/floating-chat";
import { isApiErrorStatus } from "@/lib/api";
import { useAuthContext } from "@/lib/auth-context";
import { CoworkingRoomProvider } from "@/lib/coworking-room-context";
import { useAuthActions } from "@/lib/hooks/use-auth-actions";
import { useT } from "@/lib/i18n";
import { buildCurrentReturnTo, buildLoginUrl } from "@/lib/return-to";
import { SiteSettingsProvider } from "@/lib/site-settings-context";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { user, authMode, error, isError, isLoading, refetch, isFetching } = useAuthContext();
  const t = useT();
  const { googleSignInUrl } = useAuthActions();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isUnauthenticated = isApiErrorStatus(error, 401) || (!isLoading && !isError && !user);
  const loginUrl = buildLoginUrl(buildCurrentReturnTo(pathname, searchParams));

  useEffect(() => {
    if (isUnauthenticated) {
      router.replace(loginUrl);
    }
  }, [isUnauthenticated, loginUrl, router]);

  if (isLoading || isUnauthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
        {t("common.status.loading")}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">
            {t("layout.sessionUnavailable.title")}
          </h1>
          <p className="mt-2 text-sm text-gray-600">{t("layout.sessionUnavailable.description")}</p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isFetching ? `${t("common.actions.retry")}...` : t("common.actions.retry")}
            </button>
            <Link
              href="/login"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t("common.actions.signInWithEmail")}
            </Link>
            <a
              href={googleSignInUrl}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t("common.actions.signInAgain")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SiteSettingsProvider>
      <CoworkingRoomProvider>
        <div className="flex h-screen flex-col">
          <Header user={user} authMode={authMode} />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar user={user} />
            <main className="flex-1 overflow-auto bg-gray-50">{children}</main>
          </div>
          <FloatingChat />
          <CoworkingFloatingBar />
        </div>
      </CoworkingRoomProvider>
    </SiteSettingsProvider>
  );
}
