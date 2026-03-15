"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useCreateMeetingMutation,
  useMeetingsQuery,
  type Meeting,
  meetingsApi,
  usersApi,
  calendarApi,
  useCalendarStatusQuery,
  useCalendarEventsQuery,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useT } from "@/lib/i18n";

export default function MeetingsPage() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const { dateTime } = useFormatters();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [runningMeetingId, setRunningMeetingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatorLabels, setCreatorLabels] = useState<Record<string, string>>({});
  const calendarStatus = useCalendarStatusQuery();
  const isCalendarConnected = calendarStatus.data?.connected ?? false;
  const [showImportModal, setShowImportModal] = useState(false);
  const [importingEventId, setImportingEventId] = useState<string | null>(null);
  const [newScheduledAt, setNewScheduledAt] = useState("");
  const [useSchedule, setUseSchedule] = useState(false);
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>([]);
  const [filterCreatorId, setFilterCreatorId] = useState<string>("");

  const { data, isLoading: loading, error, refetch } = useMeetingsQuery();
  const createMeetingMutation = useCreateMeetingMutation();

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
    [data?.meetings, dateTime],
  );

  const creatorOptions = useMemo(() => {
    const ids = [...new Set(allMeetings.map((m) => m.creatorId))];
    return ids.map((id) => ({ id, label: creatorLabels[id] ?? id }));
  }, [allMeetings, creatorLabels]);

  const meetings = useMemo(
    () => filterCreatorId ? allMeetings.filter((m) => m.creatorId === filterCreatorId) : allMeetings,
    [allMeetings, filterCreatorId],
  );

  const resetCreateForm = () => {
    setNewMeetingTitle("");
    setNewScheduledAt("");
    setUseSchedule(false);
    setAttendeeInput("");
    setAttendeeEmails([]);
    setCreateError(null);
  };

  const addAttendeeEmail = () => {
    const email = attendeeInput.trim();
    if (email && email.includes("@") && !attendeeEmails.includes(email)) {
      setAttendeeEmails((prev) => [...prev, email]);
      setAttendeeInput("");
    }
  };

  const handleCreateMeeting = async () => {
    if (!newMeetingTitle.trim()) return;

    try {
      setCreateError(null);
      await createMeetingMutation.mutateAsync({
        title: newMeetingTitle,
        scheduledAt: useSchedule && newScheduledAt ? newScheduledAt : undefined,
        attendeeEmails: attendeeEmails.length > 0 ? attendeeEmails : undefined,
      });
      setShowCreateModal(false);
      resetCreateForm();
      setMessage(t("meetings.list.createSuccess"));
      await refetch();
    } catch (createErrorValue) {
      setCreateError(getApiErrorMessage(createErrorValue, t("meetings.list.createError")));
    }
  };

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

        {message && <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">{message}</div>}

        {error && (
          <div className="mb-6 space-y-3">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {getApiErrorMessage(error, t("meetings.list.loadError"))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void refetch()}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                {t("common.actions.retry")}
              </button>
            </div>
          </div>
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
              <div key={meeting.id} className="flex items-center justify-between gap-4 p-4 hover:bg-gray-50">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                {t("meetings.create.title")}
              </h2>
              {createError ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {createError}
                </div>
              ) : null}
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t("meetings.create.fieldTitle")}
                </label>
                <input
                  type="text"
                  value={newMeetingTitle}
                  onChange={(e) => setNewMeetingTitle(e.target.value)}
                  placeholder={t("meetings.create.placeholder")}
                  disabled={createMeetingMutation.isPending}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={useSchedule}
                    onChange={(e) => {
                      setUseSchedule(e.target.checked);
                      if (e.target.checked) {
                        const now = new Date();
                        const ms = 15 * 60 * 1000;
                        const rounded = new Date(Math.ceil(now.getTime() / ms) * ms);
                        const local = new Date(rounded.getTime() - rounded.getTimezoneOffset() * 60000);
                        setNewScheduledAt(local.toISOString().slice(0, 16));
                      } else {
                        setNewScheduledAt("");
                      }
                    }}
                    disabled={createMeetingMutation.isPending}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {t("meetings.create.useSchedule")}
                </label>
                {useSchedule && (
                  <input
                    type="datetime-local"
                    value={newScheduledAt}
                    onChange={(e) => setNewScheduledAt(e.target.value)}
                    disabled={createMeetingMutation.isPending}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}
              </div>
              {isCalendarConnected && (
                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("meetings.create.attendees")}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={attendeeInput}
                      onChange={(e) => setAttendeeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAttendeeEmail();
                        }
                      }}
                      placeholder={t("meetings.create.attendeePlaceholder")}
                      disabled={createMeetingMutation.isPending}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={addAttendeeEmail}
                      disabled={createMeetingMutation.isPending || !attendeeInput.trim()}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      {t("meetings.create.addAttendee")}
                    </button>
                  </div>
                  {attendeeEmails.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {attendeeEmails.map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                        >
                          {email}
                          <button
                            type="button"
                            onClick={() => setAttendeeEmails((prev) => prev.filter((e) => e !== email))}
                            className="ml-0.5 text-blue-600 hover:text-blue-900"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    {t("meetings.create.attendeeHint")}
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  disabled={createMeetingMutation.isPending}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  {t("common.actions.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleCreateMeeting}
                  disabled={createMeetingMutation.isPending || !newMeetingTitle.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {createMeetingMutation.isPending
                    ? t("meetings.create.creating")
                    : t("meetings.create.submit")}
                </button>
              </div>
            </div>
          </div>
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

function CreatorFilter({
  options,
  value,
  onChange,
  allLabel,
  placeholder,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  allLabel: string;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedLabel = value ? (options.find((o) => o.id === value)?.label ?? value) : allLabel;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(""); }}
        className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <span className="max-w-[150px] truncate">{selectedLabel}</span>
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              autoFocus
              className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 ${!value ? "font-medium text-blue-600" : "text-gray-700"}`}
            >
              {allLabel}
            </button>
            {filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(opt.id); setOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 ${value === opt.id ? "font-medium text-blue-600" : "text-gray-700"}`}
              >
                {opt.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-400">{placeholder}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarImportModal({
  onClose,
  onImport,
  importingEventId,
}: {
  onClose: () => void;
  onImport: (eventId: string) => void;
  importingEventId: string | null;
}) {
  const t = useT();
  const { dateTime } = useFormatters();
  const eventsQuery = useCalendarEventsQuery(14, true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {t("meetings.calendar.importTitle")}
        </h2>
        {eventsQuery.isLoading ? (
          <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
        ) : eventsQuery.isError ? (
          <p className="text-sm text-red-600">{t("meetings.calendar.loadError")}</p>
        ) : !eventsQuery.data?.events.length ? (
          <p className="text-sm text-gray-500">{t("meetings.calendar.noEvents")}</p>
        ) : (
          <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
            {eventsQuery.data.events.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{event.summary}</p>
                  <p className="text-xs text-gray-500">
                    {dateTime(event.start)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onImport(event.id)}
                  disabled={importingEventId !== null}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {importingEventId === event.id
                    ? t("meetings.calendar.importing")
                    : t("meetings.calendar.importAction")}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            {t("common.actions.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
