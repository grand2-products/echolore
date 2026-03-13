"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { wikiApi, type Page, type WikiSearchMeta } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Page[]>([]);
  const [searchMeta, setSearchMeta] = useState<WikiSearchMeta | null>(null);
  const [semanticSearch, setSemanticSearch] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const buildSearchHref = (value: string, semantic: boolean) => {
    const params = new URLSearchParams();
    const normalizedQuery = value.trim();
    if (normalizedQuery) {
      params.set("q", normalizedQuery);
      if (!semantic) {
        params.set("semantic", "0");
      }
    }
    const queryString = params.toString();
    return queryString ? `/search?${queryString}` : "/search";
  };

  const runSearch = async (rawQuery: string, semantic: boolean) => {
    const normalizedQuery = rawQuery.trim();
    if (!normalizedQuery) {
      setResults([]);
      setSearchMeta(null);
      setError(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const searchResults = await wikiApi.searchPages(normalizedQuery, { semantic });
      setResults(searchResults.pages);
      setSearchMeta(searchResults.searchMeta ?? null);
    } catch (searchError) {
      setError(getApiErrorMessage(searchError, t("search.error")));
      setResults([]);
      setSearchMeta(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initialQuery = searchParams.get("q") ?? "";
    const semantic = searchParams.get("semantic") !== "0";
    setQuery(initialQuery);
    setSemanticSearch(semantic);

    if (initialQuery.trim()) {
      void runSearch(initialQuery, semantic);
      return;
    }

    setResults([]);
    setSearchMeta(null);
    setError(null);
  }, [searchParams]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    router.push(buildSearchHref(query, semanticSearch));
  };

  return (
    <div className="p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">{t("search.title")}</h1>
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("search.placeholder")}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 pl-10 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <svg
                className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <button type="submit" className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700">
              {t("search.submit")}
            </button>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={semanticSearch}
              onChange={(event) => {
                const nextSemantic = event.target.checked;
                setSemanticSearch(nextSemantic);
                if (query.trim()) {
                  router.push(buildSearchHref(query, nextSemantic));
                }
              }}
              className="h-4 w-4"
            />
            {t("search.semantic")}
          </label>
        </form>

        {error ? (
          <div className="mb-6 space-y-3">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void runSearch(query, semanticSearch)}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                {t("common.actions.retry")}
              </button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">{t("search.searching")}</p>
          </div>
        ) : results.length > 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <span className="text-sm text-gray-500">{t("search.results", { count: results.length })}</span>
              {searchMeta?.semanticApplied && (
                <span className="ml-3 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
                  {t("search.hybrid", { model: searchMeta.model ?? "Gemini" })}
                </span>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {results.map((page) => (
                <Link key={page.id} href={`/wiki/${page.id}`} className="flex items-center gap-3 p-4 transition hover:bg-gray-50">
                  <span className="text-gray-400">-</span>
                  <div>
                    <h3 className="font-medium text-gray-900">{page.title}</h3>
                    <p className="text-sm text-gray-500">{t("search.pageType")}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : query ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">{t("search.empty")}</p>
          </div>
        ) : null}

        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-gray-900">{t("search.tipsTitle")}</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>{t("search.tip1")}</li>
            <li>{t("search.tip2")}</li>
            <li>{t("search.tip3")}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
