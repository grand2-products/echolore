"use client";

import type { SessionUser } from "@/lib/api";
import { appTitle } from "@/lib/app-config";
import { getVisibleNavigationItems } from "@/components/layout/navigation";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  children?: React.ReactNode;
  user?: SessionUser | null;
}

export function Sidebar({ children, user }: SidebarProps) {
  const pathname = usePathname();
  const t = useT();
  const visibleNavItems = getVisibleNavigationItems(user);

  return (
    <aside className="hidden h-full w-64 flex-col border-r border-gray-200 bg-white md:flex">
      <nav className="flex-1 space-y-1 p-4">
        {visibleNavItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item.icon}
              {t(`common.nav.${item.label.toLowerCase()}`)}
            </Link>
          );
        })}
      </nav>

      {children}

      <div className="border-t border-gray-200 p-4">
        <div className="text-xs text-gray-500">{t("common.copyright", { year: 2024, title: appTitle })}</div>
      </div>
    </aside>
  );
}
