"use client";

import type { SessionUser } from "@/lib/api";
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
    <aside className="relative z-30 hidden w-16 flex-col border-r border-gray-200 bg-white md:flex">
      <nav className="flex flex-1 flex-col items-center gap-1 py-4">
        {visibleNavItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const label = t(`common.nav.${item.label}`);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={label}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition ${
                isActive
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
            >
              {item.icon}
              {/* Tooltip */}
              <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {children}
    </aside>
  );
}
