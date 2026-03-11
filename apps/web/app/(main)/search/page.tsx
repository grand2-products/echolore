"use client";

import { useState } from "react";
import Link from "next/link";
import { wikiApi, type Page, type WikiSearchMeta } from "@/lib/api";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Page[]>([]);
  const [searchMeta, setSearchMeta] = useState<WikiSearchMeta | null>(null);
  const [semanticSearch, setSemanticSearch] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setResults([]);
      setSearchMeta(null);
      setError(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const searchResults = await wikiApi.searchPages(query.trim(), {
        semantic: semanticSearch,
      });
      setResults(searchResults.pages);
      setSearchMeta(searchResults.searchMeta ?? null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "検索に失敗しました";
      setError(message);
      setResults([]);
      setSearchMeta(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">検索</h1>

        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ページを検索..."
                className="w-full rounded-lg border border-gray-300 px-4 py-3 pl-10 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <button type="submit" className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700">
              検索
            </button>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={semanticSearch} onChange={(e) => setSemanticSearch(e.target.checked)} className="h-4 w-4" />
            Gemini Embedding による意味検索を有効化
          </label>
        </form>

        {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">検索中...</p>
          </div>
        ) : results.length > 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <span className="text-sm text-gray-500">{results.length}件の結果</span>
              {searchMeta?.semanticApplied && (
                <span className="ml-3 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
                  ハイブリッド検索: {searchMeta.model ?? "Gemini"}
                </span>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {results.map((page) => (
                <Link key={page.id} href={`/wiki/${page.id}`} className="flex items-center gap-3 p-4 transition hover:bg-gray-50">
                  <span className="text-gray-400">📄</span>
                  <div>
                    <h3 className="font-medium text-gray-900">{page.title}</h3>
                    <p className="text-sm text-gray-500">Wikiページ</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : query ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">検索結果が見つかりませんでした</p>
          </div>
        ) : null}

        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-gray-900">検索のヒント</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>• キーワードを入力してページタイトルを検索</li>
            <li>• 複数の単語で検索すると、より正確な結果が得られます</li>
            <li>• 大文字と小文字は区別されません</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
