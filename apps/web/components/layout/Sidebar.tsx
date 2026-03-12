"use client";

import type { SessionUser } from "@/lib/api";
import { appTitle } from "@/lib/app-config";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  children?: React.ReactNode;
  user?: SessionUser | null;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    label: "Wiki",
    href: "/wiki",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
  {
    label: "Meetings",
    href: "/meetings",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    label: "Search",
    href: "/search",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    ),
  },
  {
    label: "Access",
    href: "/admin/access",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 14a3 3 0 100-6 3 3 0 000 6zm7 6H5a2 2 0 01-2-2 5 5 0 015-5h8a5 5 0 015 5 2 2 0 01-2 2zm-7-11V4m0 0L9 7m3-3l3 3"
        />
      </svg>
    ),
  },
  {
    label: "KPI",
    href: "/admin/kpi",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20V10m5 10V4m5 16v-7M4 20h16" />
      </svg>
    ),
  },
  {
    label: "Agents",
    href: "/admin/agents",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.75 3a3.75 3.75 0 013.75 3.75v.19a5.5 5.5 0 012.94 4.88V13a3 3 0 013 3v3H4v-3a3 3 0 013-3v-1.18a5.5 5.5 0 012.75-4.77v-.3A3.75 3.75 0 019.75 3zm0 2A1.75 1.75 0 008 6.75v1.02l-.55.29A3.5 3.5 0 005.5 11.82V15H18.5v-3a1 1 0 00-1-1h-1v-1.18a3.5 3.5 0 00-2.12-3.22l-.63-.27v-.58A1.75 1.75 0 0012 5h-2.25z"
        />
      </svg>
    ),
  },
];

export function Sidebar({ children, user }: SidebarProps) {
  const pathname = usePathname();
  const t = useT();
  const visibleNavItems = navItems.filter(
    (item) => !item.href.startsWith("/admin/") || user?.role === "admin"
  );

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
