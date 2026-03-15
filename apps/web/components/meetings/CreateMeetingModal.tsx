"use client";

import { useState } from "react";
import { ErrorBanner } from "@/components/ui";
import { useCreateMeetingMutation } from "@/lib/api";
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

  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [newScheduledAt, setNewScheduledAt] = useState("");
  const [useSchedule, setUseSchedule] = useState(false);
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);

  const addAttendeeEmail = () => {
    const email = attendeeInput.trim();
    if (email?.includes("@") && !attendeeEmails.includes(email)) {
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
              onChange={(e) => setNewMeetingTitle(e.target.value)}
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
            <label
              htmlFor="attendee-email-input"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              {t("meetings.create.attendees")}
            </label>
            <div className="flex gap-2">
              <input
                id="attendee-email-input"
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
            <p className="mt-1 text-xs text-gray-500">{t("meetings.create.attendeeHint")}</p>
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
