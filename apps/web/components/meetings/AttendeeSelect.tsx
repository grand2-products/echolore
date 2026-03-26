"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useCalendarContactsQuery } from "@/lib/api";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { useT } from "@/lib/i18n";

export interface AttendeeSelectProps {
  selectedEmails: string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
}

export function AttendeeSelect({ selectedEmails, onChange, disabled }: AttendeeSelectProps) {
  const t = useT();
  const { data, isLoading } = useCalendarContactsQuery();
  const contacts = data?.contacts ?? [];

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeDropdown = useCallback(() => setOpen(false), []);
  useClickOutside(containerRef, closeDropdown);

  const filtered = useMemo(() => {
    if (!query) return contacts;
    const q = query.toLowerCase();
    return contacts.filter(
      (c) => c.email.toLowerCase().includes(q) || c.displayName?.toLowerCase().includes(q)
    );
  }, [contacts, query]);

  const unselected = useMemo(
    () => filtered.filter((c) => !selectedEmails.includes(c.email)),
    [filtered, selectedEmails]
  );

  const addEmail = (email: string) => {
    if (email && !selectedEmails.includes(email)) {
      onChange([...selectedEmails, email]);
    }
  };

  const removeEmail = (email: string) => {
    onChange(selectedEmails.filter((e) => e !== email));
  };

  const contactDisplayMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts) {
      if (c.displayName) map.set(c.email, c.displayName);
    }
    return map;
  }, [contacts]);

  const getDisplayLabel = (email: string) => contactDisplayMap.get(email) ?? email;

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor="attendee-search-input"
        className="mb-1 block text-sm font-medium text-gray-700"
      >
        {t("meetings.create.attendees")}
      </label>

      {/* Selected attendees as tags */}
      {selectedEmails.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {selectedEmails.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
            >
              {getDisplayLabel(email)}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeEmail(email)}
                  className="ml-0.5 text-blue-600 hover:text-blue-900"
                >
                  &times;
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Search input that opens dropdown */}
      <div className="relative">
        <input
          id="attendee-search-input"
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (open && unselected.length > 0) {
              addEmail(unselected[0]?.email ?? "");
              setQuery("");
            } else if (query.trim().includes("@")) {
              addEmail(query.trim());
              setQuery("");
            }
          }}
          placeholder={
            isLoading
              ? t("meetings.create.contactsLoading")
              : t("meetings.create.attendeeSearchPlaceholder")
          }
          disabled={disabled}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {/* Dropdown */}
        {open && (
          <div className="absolute left-0 right-0 z-10 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="max-h-48 overflow-y-auto py-1">
              {isLoading && (
                <p className="px-3 py-2 text-sm text-gray-400">
                  {t("meetings.create.contactsLoading")}
                </p>
              )}
              {!isLoading && unselected.length === 0 && query && (
                <button
                  type="button"
                  onClick={() => {
                    if (query.includes("@")) {
                      addEmail(query.trim());
                      setQuery("");
                    }
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100"
                >
                  {query.includes("@")
                    ? t("meetings.create.addManualEmail", { email: query.trim() })
                    : t("meetings.create.noContactsFound")}
                </button>
              )}
              {!isLoading && unselected.length === 0 && !query && contacts.length === 0 && (
                <p className="px-3 py-2 text-sm text-gray-400">
                  {t("meetings.create.noContactsFound")}
                </p>
              )}
              {unselected.map((contact) => (
                <button
                  key={contact.email}
                  type="button"
                  onClick={() => {
                    addEmail(contact.email);
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-gray-100"
                >
                  <span className="block text-sm text-gray-900">
                    {contact.displayName || contact.email}
                  </span>
                  {contact.displayName && (
                    <span className="block text-xs text-gray-500">{contact.email}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="mt-1 text-xs text-gray-500">{t("meetings.create.attendeeHint")}</p>
    </div>
  );
}
