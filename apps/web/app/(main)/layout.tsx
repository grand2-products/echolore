"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { FloatingChat } from "@/components/ai-chat/floating-chat";
import { CoworkingFloatingBar } from "@/components/coworking/floating-bar";
import { Header, Sidebar } from "@/components/layout";
import { isApiErrorStatus } from "@/lib/api";
import { useAuthContext } from "@/lib/auth-context";
import { CoworkingRoomProvider } from "@/lib/coworking-room-context";
import { useT } from "@/lib/i18n";
import { buildCurrentReturnTo, buildLoginUrl } from "@/lib/return-to";
import { SiteSettingsProvider } from "@/lib/site-settings-context";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
          Loading...
        </div>
      }
    >
      <MainLayoutInner>{children}</MainLayoutInner>
    </Suspense>
  );
}

function MainLayoutInner({ children }: MainLayoutProps) {
  const { user, authMode, error, isError, isLoading, refetch, isFetching } = useAuthContext();
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isUnauthenticated = isApiErrorStatus(error, 401) || (!isLoading && !isError && !user);
  const isServerError = isError && !isApiErrorStatus(error, 401);

  const loginUrl = buildLoginUrl(buildCurrentReturnTo(pathname, searchParams));

  useEffect(() => {
    if (isUnauthenticated) {
      router.replace(loginUrl);
    }
  }, [isUnauthenticated, loginUrl, router]);

  if (isServerError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">{t("layout.serverError.title")}</h1>
          <p className="mt-2 text-sm text-gray-600">{t("layout.serverError.description")}</p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isFetching ? `${t("common.actions.retry")}...` : t("common.actions.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || isUnauthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
        {t("common.status.loading")}
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
