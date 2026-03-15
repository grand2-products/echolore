"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getVisibleNavigationItems } from "@/components/layout/navigation";
import type { AuthMeResponse, Page, SessionUser, Space } from "@/lib/api";
import { useSpacesQuery, wikiApi } from "@/lib/api";
import { useAuthActions } from "@/lib/hooks/use-auth-actions";
import { useT } from "@/lib/i18n";
import { useSiteTitle } from "@/lib/site-settings-context";

interface HeaderProps {
  user?: SessionUser | null;
  authMode?: AuthMeResponse["authMode"];
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function SearchSuggestions({
  results,
  isLoading,
  query,
  onSelect,
  spaceMap,
}: {
  results: Page[];
  isLoading: boolean;
  query: string;
  onSelect: () => void;
  spaceMap: Record<string, Space>;
}) {
  const t = useT();

  if (isLoading) {
    return <div className="px-4 py-3 text-sm text-gray-500">{t("search.searching")}</div>;
  }

  if (results.length === 0) {
    return <div className="px-4 py-3 text-sm text-gray-500">{t("search.empty")}</div>;
  }

  return (
    <>
      {results.slice(0, 8).map((page) => {
        const space = spaceMap[page.spaceId];
        return (
          <Link
            key={page.id}
            href={`/wiki/${page.id}`}
            onClick={onSelect}
            className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100"
          >
            <svg
              className="h-4 w-4 shrink-0 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="min-w-0 flex-1 truncate text-gray-700">
              {page.title || t("wiki.newPage.defaultTitle")}
            </span>
            <span className="shrink-0 text-xs text-gray-400">
              {space ? space.name : ""}
              {space ? " · " : ""}
              {formatRelativeDate(page.updatedAt)}
            </span>
          </Link>
        );
      })}
      <Link
        href={`/search?q=${encodeURIComponent(query)}`}
        onClick={onSelect}
        className="block border-t border-gray-100 px-4 py-2 text-center text-xs text-blue-600 hover:bg-gray-50"
      >
        {t("search.viewAll")}
      </Link>
    </>
  );
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const siteTitle = useSiteTitle();
  const { logout } = useAuthActions();
  const [query, setQuery] = useState("");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileNavItems = getVisibleNavigationItems(user);

  // Space map for search suggestions
  const { data: spacesData } = useSpacesQuery();
  const spaceMap = useMemo(() => {
    const map: Record<string, Space> = {};
    for (const s of spacesData?.spaces ?? []) map[s.id] = s;
    return map;
  }, [spacesData]);

  // Search suggestions state
  const [suggestions, setSuggestions] = useState<Page[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void pathname; // close menus on route change
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

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(target) &&
        mobileSearchContainerRef.current &&
        !mobileSearchContainerRef.current.contains(target)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const fetchSuggestions = useCallback(async (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      setShowSuggestions(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSuggestionsLoading(true);
    setShowSuggestions(true);
    try {
      const res = await wikiApi.searchPages(normalized, { semantic: false });
      if (!controller.signal.aborted) {
        setSuggestions(res.pages);
        setSuggestionsLoading(false);
      }
    } catch {
      if (!controller.signal.aborted) {
        setSuggestions([]);
        setSuggestionsLoading(false);
      }
    }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(() => void fetchSuggestions(value), 300);
  };

  const closeSuggestions = () => {
    setShowSuggestions(false);
  };

  const navigateToSearch = useCallback(
    (value: string) => {
      const normalized = value.trim();
      setShowSuggestions(false);
      router.push(normalized ? `/search?q=${encodeURIComponent(normalized)}` : "/search");
    },
    [router]
  );

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigateToSearch(query);
  };

  const handleLogout = async () => {
    await logout();
  };

  const suggestionsDropdown = showSuggestions && query.trim() && (
    <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
      <SearchSuggestions
        results={suggestions}
        isLoading={suggestionsLoading}
        query={query.trim()}
        spaceMap={spaceMap}
        onSelect={closeSuggestions}
      />
    </div>
  );

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
            <svg
              aria-hidden="true"
              className="h-6 w-6 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-blue-600">{siteTitle}</span>
          </Link>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="hidden min-w-0 flex-1 justify-center px-4 md:flex"
        >
          <div ref={searchContainerRef} className="relative w-full max-w-md">
            <input
              type="text"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              onFocus={() => {
                if (query.trim() && suggestions.length > 0) setShowSuggestions(true);
              }}
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
            {suggestionsDropdown}
          </div>
        </form>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full p-1 transition hover:bg-gray-100"
            >
              {user?.avatarUrl ? (
                <Image
                  src={user.avatarUrl}
                  alt={user.name}
                  width={32}
                  height={32}
                  unoptimized
                  className="h-8 w-8 rounded-full"
                />
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
                  <p className="text-sm font-medium text-gray-900">
                    {user?.name || t("common.userFallback")}
                  </p>
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
            <div ref={mobileSearchContainerRef} className="relative">
              <input
                type="text"
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                onFocus={() => {
                  if (query.trim() && suggestions.length > 0) setShowSuggestions(true);
                }}
                placeholder={t("search.placeholder")}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {suggestionsDropdown}
            </div>
          </form>

          <nav className="space-y-1">
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
                  {t(`common.nav.${item.label}`)}
                </Link>
              );
            })}
            <Link
              href="/settings"
              className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
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
