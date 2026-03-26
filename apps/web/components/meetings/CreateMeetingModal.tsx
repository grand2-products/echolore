"use client";

import { useEffect, useState } from "react";
import { AttendeeSelect } from "@/components/meetings/AttendeeSelect";
import { ErrorBanner } from "@/components/ui";
import { useAuthMeQuery, useCreateMeetingMutation } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";

export interface CreateMeetingModalProps {
  isCalendarConnected: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateMeetingModal({
  isCalendarConnected,
  onClose,
  onCreated,
}: CreateMeetingModalProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const createMeetingMutation = useCreateMeetingMutation();
  const { data: meData } = useAuthMeQuery();
  const userName = meData?.user?.name ?? "";

  const defaultTitle = userName ? t("meetings.create.defaultTitle", { name: userName }) : "";

  const [newMeetingTitle, setNewMeetingTitle] = useState(defaultTitle);
  const [titleTouched, setTitleTouched] = useState(false);
  const [newScheduledAt, setNewScheduledAt] = useState("");
  const [useSchedule, setUseSchedule] = useState(false);
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);

  // Update default title once user data loads (if not yet touched by user)
  useEffect(() => {
    if (defaultTitle && !titleTouched && !newMeetingTitle) {
      setNewMeetingTitle(defaultTitle);
    }
  }, [defaultTitle, titleTouched, newMeetingTitle]);

  const handleCreateMeeting = async () => {
    if (!newMeetingTitle.trim()) return;

    try {
      setCreateError(null);
      await createMeetingMutation.mutateAsync({
        title: newMeetingTitle,
        scheduledAt: useSchedule && newScheduledAt ? newScheduledAt : undefined,
        attendeeEmails: attendeeEmails.length > 0 ? attendeeEmails : undefined,
      });
      onCreated();
    } catch (createErrorValue) {
      setCreateError(getApiErrorMessage(createErrorValue, t("meetings.list.createError")));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("meetings.create.title")}</h2>
        {createError ? <ErrorBanner message={createError} className="mb-4" /> : null}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t("meetings.create.fieldTitle")}
            <input
              type="text"
              value={newMeetingTitle}
              onChange={(e) => {
                setNewMeetingTitle(e.target.value);
                setTitleTouched(true);
              }}
              placeholder={t("meetings.create.placeholder")}
              disabled={createMeetingMutation.isPending}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-normal focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
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
            <AttendeeSelect
              selectedEmails={attendeeEmails}
              onChange={setAttendeeEmails}
              disabled={createMeetingMutation.isPending}
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
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
  );
}
