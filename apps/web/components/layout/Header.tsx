"use client";

import { authApi, type AuthMeResponse, type SessionUser } from "@/lib/api";
import { appTitle } from "@/lib/app-config";
import { supportedLocales, useLocale, useSetLocale, useT, type SupportedLocale } from "@/lib/i18n";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface HeaderProps {
  user?: SessionUser | null;
  authMode?: AuthMeResponse["authMode"];
}

const primaryNavItems = [
  { href: "/wiki", label: "Wiki" },
  { href: "/meetings", label: "Meetings" },
  { href: "/search", label: "Search" },
];

const adminNavItems = [
  { href: "/admin/access", label: "Access" },
  { href: "/admin/kpi", label: "KPI" },
  { href: "/admin/agents", label: "Agents" },
];

export function Header({ user, authMode }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useT();
  const [query, setQuery] = useState("");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileNavItems =
    user?.role === "admin" ? [...primaryNavItems, ...adminNavItems] : primaryNavItems;

  useEffect(() => {
    setIsUserMenuOpen(false);
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/search") {
      setQuery(searchParams.get("q") ?? "");
      return;
    }
    setQuery("");
  }, [pathname, searchParams]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = query.trim();
    router.push(normalizedQuery ? `/search?q=${encodeURIComponent(normalizedQuery)}` : "/search");
  };

  const handleLogout = async () => {
    if (authMode === "password") {
      await authApi.logout().catch(() => undefined);
      router.push("/login");
      router.refresh();
      return;
    }

    window.location.href = "/oauth2/sign_out";
  };

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-gray-100 md:hidden"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            aria-label={t("common.openMobileNavigation")}
          >
            <svg aria-hidden="true" className="h-6 w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-blue-600">{appTitle}</span>
          </Link>
        </div>

        <form onSubmit={handleSearchSubmit} className="hidden min-w-0 flex-1 justify-center px-4 md:flex">
          <div className="relative w-full max-w-md">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search.placeholder")}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 pl-10 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <svg
              aria-hidden="true"
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </form>

        <nav className="hidden items-center gap-6 md:flex">
          {primaryNavItems.map((item) => (
            <Link key={item.href} href={item.href} className="text-gray-600 transition hover:text-blue-600">
              {t(`common.nav.${item.label.toLowerCase()}`)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <label className="hidden items-center gap-2 text-sm text-gray-600 md:flex">
            <span>{t("common.language.label")}</span>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as SupportedLocale)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              {supportedLocales.map((option) => (
                <option key={option} value={option}>
                  {t(`common.language.${option}`)}
                </option>
              ))}
            </select>
          </label>

          <div className="relative">
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-full p-1 transition hover:bg-gray-100"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="h-8 w-8 rounded-full" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
                {user?.name?.charAt(0) || "U"}
              </div>
            )}
            <span className="hidden text-sm font-medium text-gray-700 md:block">
              {user?.name || t("common.userFallback")}
            </span>
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <div className="border-b border-gray-100 px-4 py-2">
                <p className="text-sm font-medium text-gray-900">{user?.name || t("common.userFallback")}</p>
                <p className="text-xs text-gray-500">{user?.email || "user@example.com"}</p>
              </div>
              <Link
                href="/settings"
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => setIsUserMenuOpen(false)}
              >
                {t("common.nav.settings")}
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                {t("common.nav.logout")}
              </button>
            </div>
          )}
        </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="border-t border-gray-200 bg-white px-4 py-4 md:hidden">
          <form onSubmit={handleSearchSubmit} className="mb-4">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search.placeholder")}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </form>

          <nav className="space-y-1">
            <label className="mb-3 block text-sm text-gray-600">
              {t("common.language.label")}
              <select
                value={locale}
                onChange={(event) => setLocale(event.target.value as SupportedLocale)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {supportedLocales.map((option) => (
                  <option key={option} value={option}>
                    {t(`common.language.${option}`)}
                  </option>
                ))}
              </select>
            </label>
            {mobileNavItems.map((item) => {
              const isActive =
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {t(`common.nav.${item.label.toLowerCase()}`)}
                </Link>
              );
            })}
            <Link href="/settings" className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
              {t("common.nav.settings")}
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              {t("common.nav.logout")}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
