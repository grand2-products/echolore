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
    return <div className="px-6 py-4 text-sm text-gray-500">{t("common.status.loading")}</div>;
  }

  if (error || !canView) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md border border-gray-200 bg-white px-6 py-5 text-center">
          <h1 className="text-base font-semibold text-gray-900">
            {t("marketing.forbidden.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-600">{t("marketing.forbidden.description")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <nav className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-3 py-2">
        {tabs
          .filter((tab) => !("manageOnly" in tab) || can("marketing.manage"))
          .map((tab) => {
            const isActive =
              tab.href === "/marketing" ? pathname === "/marketing" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  isActive
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {t(`marketing.tabs.${tab.key}`)}
              </Link>
            );
          })}
      </nav>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </div>
  );
}
