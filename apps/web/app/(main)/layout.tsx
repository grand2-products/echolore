"use client";

import { Header, Sidebar } from "@/components/layout";
import { useAuthMeQuery } from "@/lib/api";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { data, isError, isLoading } = useAuthMeQuery();
  const user = data?.user ?? null;

  return (
    <div className="flex h-screen flex-col">
      <Header user={user} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar user={user} />
        <main className="flex-1 overflow-auto bg-gray-50">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              Loading session...
            </div>
          ) : isError || !user ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
                <h1 className="text-lg font-semibold text-gray-900">Session unavailable</h1>
                <p className="mt-2 text-sm text-gray-600">
                  Could not load the authenticated user from `/api/auth/me`.
                </p>
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
