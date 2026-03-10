"use client";

import Link from "next/link";
import { useMeetingsQuery, useWikiPagesQuery } from "@/lib/api";

export default function HomePage() {
  const {
    data: meetingsData,
    error: meetingsError,
    isLoading: isMeetingsLoading,
  } = useMeetingsQuery();
  const {
    data: pagesData,
    error: pagesError,
    isLoading: isPagesLoading,
  } = useWikiPagesQuery();

  const pages = pagesData?.pages ?? [];
  const meetings = meetingsData?.meetings ?? [];

  const recentUpdates = [
    ...pages.slice(0, 5).map((page) => ({
      id: `wiki-${page.id}`,
      date: new Date(page.updatedAt).toLocaleDateString("ja-JP"),
      label: `Wikiページ「${page.title}」が更新されました`,
    })),
    ...meetings.slice(0, 5).map((meeting) => ({
      id: `meeting-${meeting.id}`,
      date: new Date(meeting.createdAt).toLocaleDateString("ja-JP"),
      label: `新しいミーティング「${meeting.title}」が作成されました`,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-3xl font-bold text-gray-900">社内ポータル</h1>
        <p className="text-gray-600">grand2 Products 社内Wiki & ビデオ会議ツール</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link
            href="/wiki"
            className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-500 hover:shadow-md"
          >
            <h2 className="mb-2 text-xl font-semibold text-gray-900">📚 社内Wiki</h2>
            <p className="text-gray-600">NotionライクなBlock-basedエディタでナレッジを共有</p>
          </Link>

          <Link
            href="/meetings"
            className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-500 hover:shadow-md"
          >
            <h2 className="mb-2 text-xl font-semibold text-gray-900">🎥 ビデオ会議</h2>
            <p className="text-gray-600">Everybody Coworking / Room モードでリアルタイムコミュニケーション</p>
          </Link>
        </div>

        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">最近の更新</h2>
          {(isPagesLoading || isMeetingsLoading) && (
            <div className="text-sm text-gray-600">読み込み中...</div>
          )}
          {(pagesError || meetingsError) && (
            <div className="mb-3 text-sm text-red-600">
              {pagesError instanceof Error
                ? pagesError.message
                : meetingsError instanceof Error
                  ? meetingsError.message
                  : "更新情報の取得に失敗しました"}
            </div>
          )}
          {!isPagesLoading && !isMeetingsLoading && !pagesError && !meetingsError && (
            <div className="space-y-3">
              {recentUpdates.map((update, index) => (
                <div
                  key={update.id}
                  className={`flex items-center gap-3 ${index < recentUpdates.length - 1 ? "border-b border-gray-100 pb-3" : ""}`}
                >
                  <span className="text-sm text-gray-500">{update.date}</span>
                  <span className="text-gray-700">{update.label}</span>
                </div>
              ))}
              {recentUpdates.length === 0 && (
                <div className="text-sm text-gray-500">更新情報がありません</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

