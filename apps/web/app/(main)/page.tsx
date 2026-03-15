"use client";

import { useMeetingsQuery, useWikiPagesQuery } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";
import { useSiteTagline, useSiteTitle } from "@/lib/site-settings-context";
import Link from "next/link";

export default function HomePage() {
  const t = useT();
  const { date } = useFormatters();
  const siteTitle = useSiteTitle();
  const siteTagline = useSiteTagline();
  const {
    data: meetingsData,
    error: meetingsError,
    isLoading: isMeetingsLoading,
    refetch: refetchMeetings,
  } = useMeetingsQuery();
  const {
    data: pagesData,
    error: pagesError,
    isLoading: isPagesLoading,
    refetch: refetchPages,
  } = useWikiPagesQuery();

  const pages = pagesData?.pages ?? [];
  const meetings = meetingsData?.meetings ?? [];

  const recentUpdates = [
    ...pages.slice(0, 5).map((page) => ({
      id: `wiki-${page.id}`,
      href: `/wiki/${page.id}`,
      date: date(page.updatedAt),
      sortKey: new Date(page.updatedAt).getTime(),
      label: t("home.recentUpdateWiki", { title: page.title }),
    })),
    ...meetings.slice(0, 5).map((meeting) => ({
      id: `meeting-${meeting.id}`,
      href: `/meetings/${meeting.id}`,
      date: date(meeting.createdAt),
      sortKey: new Date(meeting.createdAt).getTime(),
      label: t("home.recentUpdateMeeting", { title: meeting.title }),
    })),
  ]
    .sort((a, b) => b.sortKey - a.sortKey)
    .slice(0, 5);

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-3xl font-bold text-gray-900">{siteTitle}</h1>
        <p className="text-gray-600">{siteTagline}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link
            href="/wiki"
            className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-500 hover:shadow-md"
          >
            <h2 className="mb-2 text-xl font-semibold text-gray-900">{t("home.wikiTitle")}</h2>
            <p className="text-gray-600">{t("home.wikiDescription")}</p>
          </Link>

          <Link
            href="/meetings"
            className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-500 hover:shadow-md"
          >
            <h2 className="mb-2 text-xl font-semibold text-gray-900">{t("home.meetingsTitle")}</h2>
            <p className="text-gray-600">{t("home.meetingsDescription")}</p>
          </Link>
        </div>

        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("home.recentUpdates")}</h2>
          {(isPagesLoading || isMeetingsLoading) && (
            <div className="text-sm text-gray-600">{t("common.status.loading")}</div>
          )}
          {(pagesError || meetingsError) && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <span>{t("home.loadError")}</span>
              <button
                type="button"
                onClick={() => {
                  void refetchPages();
                  void refetchMeetings();
                }}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                {t("common.actions.retry")}
              </button>
            </div>
          )}
          {!isPagesLoading && !isMeetingsLoading && !pagesError && !meetingsError && (
            <div className="space-y-3">
              {recentUpdates.map((update, index) => (
                <Link
                  key={update.id}
                  href={update.href}
                  className={`flex items-center gap-3 ${
                    index < recentUpdates.length - 1
                      ? "border-b border-gray-100 pb-3 text-gray-700 hover:text-blue-600"
                      : "text-gray-700 hover:text-blue-600"
                  }`}
                >
                  <span className="text-sm text-gray-500">{update.date}</span>
                  <span>{update.label}</span>
                </Link>
              ))}
              {recentUpdates.length === 0 && (
                <div className="text-sm text-gray-500">{t("home.noUpdates")}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
