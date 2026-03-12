"use client";

import { Header, Sidebar } from "@/components/layout";
import { useAuthContext } from "@/lib/auth-context";
import { useAuthActions } from "@/lib/use-auth-actions";
import { useT } from "@/lib/i18n";
import Link from "next/link";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { user, authMode, isError, isLoading, refetch, isFetching } = useAuthContext();
  const t = useT();
  const { googleSignInUrl } = useAuthActions();

  return (
    <div className="flex h-screen flex-col">
      <Header user={user} authMode={authMode} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar user={user} />
        <main className="flex-1 overflow-auto bg-gray-50">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              {t("common.status.loading")}
            </div>
          ) : isError || !user ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
                <h1 className="text-lg font-semibold text-gray-900">
                  {t("layout.sessionUnavailable.title")}
                </h1>
                <p className="mt-2 text-sm text-gray-600">
                  {t("layout.sessionUnavailable.description")}
                </p>
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
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
