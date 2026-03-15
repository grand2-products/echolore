"use client";

import { useAuthContext } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const adminTabs = [
  { key: "users", href: "/admin/users" },
  { key: "access", href: "/admin/access" },
  { key: "agents", href: "/admin/agents" },
  { key: "kpi", href: "/admin/kpi" },
  { key: "google", href: "/admin/google" },
  { key: "settings", href: "/admin/settings" },
] as const;

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const { user, isLoading } = useAuthContext();

  useEffect(() => {
    if (!isLoading && user?.role !== "admin") {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  if (isLoading || user?.role !== "admin") {
    return null;
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{t("admin.title")}</h1>
          <p className="mt-1 text-sm text-gray-600">{t("admin.description")}</p>
        </div>

        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
          {adminTabs.map((tab) => {
            const isActive =
              pathname === tab.href || (tab.key === "users" && pathname === "/admin");

            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {t(`admin.tabs.${tab.key}`)}
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </div>
  );
}
