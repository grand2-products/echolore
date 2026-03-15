"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarImportModal } from "@/components/meetings/CalendarImportModal";
import { CreateMeetingModal } from "@/components/meetings/CreateMeetingModal";
import { CreatorFilter } from "@/components/meetings/CreatorFilter";
import { ErrorBanner } from "@/components/ui";
import {
  calendarApi,
  type Meeting,
  meetingsApi,
  useCalendarStatusQuery,
  useMeetingsQuery,
  usersApi,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useT } from "@/lib/i18n";

export default function MeetingsPage() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const { dateTime } = useFormatters();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [runningMeetingId, setRunningMeetingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creatorLabels, setCreatorLabels] = useState<Record<string, string>>({});
  const calendarStatus = useCalendarStatusQuery();
  const isCalendarConnected = calendarStatus.data?.connected ?? false;
  const [showImportModal, setShowImportModal] = useState(false);
  const [importingEventId, setImportingEventId] = useState<string | null>(null);
  const [filterCreatorId, setFilterCreatorId] = useState<string>("");

  const { data, isLoading: loading, error, refetch } = useMeetingsQuery();

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await usersApi.list();
        setCreatorLabels(
          Object.fromEntries(
            response.users.map((user) => [user.id, user.name || user.email || user.id])
          )
        );
      } catch {
        // Meeting list still works without creator name hydration.
      }
    };

    void loadUsers();
  }, []);

  const allMeetings = useMemo(
    () =>
      (data?.meetings ?? []).map((m) => ({
        ...m,
        createdAtLabel: dateTime(m.createdAt),
      })),
    [data?.meetings, dateTime]
  );

  const creatorOptions = useMemo(() => {
    const ids = [...new Set(allMeetings.map((m) => m.creatorId))];
    return ids.map((id) => ({ id, label: creatorLabels[id] ?? id }));
  }, [allMeetings, creatorLabels]);

  const meetings = useMemo(
    () =>
      filterCreatorId ? allMeetings.filter((m) => m.creatorId === filterCreatorId) : allMeetings,
    [allMeetings, filterCreatorId]
  );

  const runRoomAi = async (meetingId: string) => {
    try {
      setRunningMeetingId(meetingId);
      setMessage(null);
      const result = await meetingsApi.runRoomAiPipeline(meetingId);
      setMessage(t("meetings.list.aiSuccess", { title: result.wikiPage.title }));
      await refetch();
    } catch (e) {
      setMessage(getApiErrorMessage(e, t("meetings.list.aiError")));
    } finally {
      setRunningMeetingId(null);
    }
  };

  const handleImportEvent = async (eventId: string) => {
    try {
      setImportingEventId(eventId);
      await calendarApi.importEvent(eventId);
      setMessage(t("meetings.calendar.importSuccess"));
      setShowImportModal(false);
      await refetch();
    } catch (e) {
      setMessage(getApiErrorMessage(e, t("meetings.calendar.importError")));
    } finally {
      setImportingEventId(null);
    }
  };

  const handleMeetingCreated = async () => {
    setShowCreateModal(false);
    setMessage(t("meetings.list.createSuccess"));
    await refetch();
  };

  const getStatusBadge = (status: Meeting["status"]) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            <span className="mr-1.5 h-2 w-2 animate-pulse rounded-full bg-green-500" />
            {t("meetings.status.active")}
          </span>
        );
      case "scheduled":
        return (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
            {t("meetings.status.scheduled")}
          </span>
        );
      case "ended":
        return (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
            {t("meetings.status.ended")}
          </span>
        );
    }
  };

  return (
    <div className="p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t("meetings.list.title")}</h1>
            <p className="mt-1 text-gray-600">{t("meetings.list.description")}</p>
          </div>
          <div className="flex items-center gap-2">
            {isCalendarConnected && (
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                {t("meetings.calendar.import")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              {t("meetings.list.new")}
            </button>
          </div>
        </div>

        {message && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            {message}
          </div>
        )}

        {error && (
          <ErrorBanner
            message={getApiErrorMessage(error, t("meetings.list.loadError"))}
            onRetry={() => void refetch()}
            className="mb-6"
          />
        )}

        {loading && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            {t("common.status.loading")}
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="font-semibold text-gray-900">{t("meetings.list.sectionTitle")}</h2>
            {creatorOptions.length > 1 && (
              <CreatorFilter
                options={creatorOptions}
                value={filterCreatorId}
                onChange={setFilterCreatorId}
                allLabel={t("meetings.list.filterAll")}
                placeholder={t("meetings.list.filterSearch")}
              />
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="flex items-center justify-between gap-4 p-4 hover:bg-gray-50"
              >
                <div>
                  <h3 className="font-medium text-gray-900">{meeting.title}</h3>
                  <p className="text-sm text-gray-500">
                    {t("meetings.list.createdBy", {
                      creator: creatorLabels[meeting.creatorId] ?? meeting.creatorId,
                      createdAt: meeting.createdAtLabel,
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(meeting.status)}
                  <button
                    type="button"
                    onClick={() => runRoomAi(meeting.id)}
                    disabled={runningMeetingId !== null}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                  >
                    {runningMeetingId === meeting.id
                      ? t("meetings.list.aiRunning")
                      : t("meetings.list.aiAction")}
                  </button>
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className={`rounded-lg px-4 py-2 text-sm font-medium ${
                      meeting.status === "active"
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {meeting.status === "active"
                      ? t("meetings.list.join")
                      : t("meetings.list.open")}
                  </Link>
                </div>
              </div>
            ))}
            {!loading && meetings.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-500">
                {t("meetings.list.empty")}
              </div>
            )}
          </div>
        </div>

        {showCreateModal && (
          <CreateMeetingModal
            isCalendarConnected={isCalendarConnected}
            onClose={() => setShowCreateModal(false)}
            onCreated={handleMeetingCreated}
          />
        )}
      </div>

      {showImportModal && (
        <CalendarImportModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImportEvent}
          importingEventId={importingEventId}
        />
      )}
    </div>
  );
}
