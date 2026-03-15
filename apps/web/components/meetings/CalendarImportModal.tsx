"use client";

import { useCalendarEventsQuery } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";

export interface CalendarImportModalProps {
  onClose: () => void;
  onImport: (eventId: string) => void;
  importingEventId: string | null;
}

export function CalendarImportModal({
  onClose,
  onImport,
  importingEventId,
}: CalendarImportModalProps) {
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
                  <p className="text-xs text-gray-500">{dateTime(event.start)}</p>
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
