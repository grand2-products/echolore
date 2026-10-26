"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMarketingAccess } from "@/lib/hooks/use-marketing-access";
import { useT } from "@/lib/i18n";

const tabs = [
  { key: "overview", href: "/marketing" },
  { key: "dashboards", href: "/marketing/dashboards" },
  { key: "assets", href: "/marketing/assets" },
  { key: "connectors", href: "/marketing/connectors" },
  { key: "changes", href: "/marketing/changes" },
  { key: "knowledge", href: "/marketing/knowledge" },
  { key: "reconciliations", href: "/marketing/reconciliations" },
  { key: "metrics", href: "/marketing/metrics" },
  { key: "settings", href: "/marketing/settings", manageOnly: true },
] as const;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();
  const { isLoading, canView, can, error } = useMarketingAccess();

  if (isLoading) {
    return <div className="p-8 text-sm text-gray-500">{t("common.status.loading")}</div>;
  }

  if (error || !canView) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center">
          <h1 className="text-lg font-semibold text-gray-900">{t("marketing.forbidden.title")}</h1>
          <p className="mt-2 text-sm text-gray-600">{t("marketing.forbidden.description")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">
          <h1 className="text-3xl font-bold text-gray-900">{t("marketing.title")}</h1>
          <p className="mt-1 text-sm text-gray-600">{t("marketing.description")}</p>
        </div>
        <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
          {tabs
            .filter((tab) => !("manageOnly" in tab) || can("marketing.manage"))
            .map((tab) => {
              const isActive =
                tab.href === "/marketing"
                  ? pathname === "/marketing"
                  : pathname.startsWith(tab.href);
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
                  {t(`marketing.tabs.${tab.key}`)}
                </Link>
              );
            })}
        </nav>
        {children}
      </div>
    </div>
  );
}
