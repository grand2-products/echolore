"use client";

import { type MeetingRecording, meetingsApi } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useEffect, useState } from "react";

export interface RecordingsListProps {
  meetingId: string;
}

export default function RecordingsList({ meetingId }: RecordingsListProps) {
  const t = useT();
  const [recordings, setRecordings] = useState<MeetingRecording[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecordings = async () => {
      try {
        const result = await meetingsApi.listRecordings(meetingId);
        setRecordings(result.recordings.filter((r) => r.status === "completed"));
      } catch {
        // ignore fetch errors
      }
    };
    void fetchRecordings();
    const timer = window.setInterval(() => void fetchRecordings(), 15000);
    return () => window.clearInterval(timer);
  }, [meetingId]);

  if (recordings.length === 0) return null;

  const formatDuration = (ms: number | null) => {
    if (ms == null) return "--:--";
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
    const s = (totalSec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const formatSize = (bytes: number | null) => {
    if (bytes == null) return "\u2014";
    return (bytes / (1024 * 1024)).toFixed(1);
  };

  return (
    <div className="border-t border-gray-800 bg-gray-900/60 px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {t("meetings.room.recordingsTitle")}
      </h3>
      <div className="space-y-2">
        {recordings.map((rec) => (
          <div key={rec.id}>
            <div className="flex items-center justify-between rounded-lg bg-gray-800/80 px-3 py-2">
              <div className="flex items-center gap-4 text-sm text-gray-300">
                <span>{t("meetings.room.recordingDuration", { value: formatDuration(rec.durationMs) })}</span>
                <span>{t("meetings.room.recordingSize", { value: formatSize(rec.fileSize) })}</span>
                <span className="text-xs text-gray-500">
                  {t("meetings.room.recordingDate", {
                    value: rec.endedAt
                      ? new Date(rec.endedAt).toLocaleString()
                      : new Date(rec.createdAt).toLocaleString(),
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlayingId(playingId === rec.id ? null : rec.id)}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500"
                >
                  {playingId === rec.id
                    ? t("meetings.room.recordingClose")
                    : t("meetings.room.recordingPlay")}
                </button>
                <a
                  href={meetingsApi.getRecordingDownloadUrl(meetingId, rec.id)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
                  download
                >
                  {t("meetings.room.recordingDownload")}
                </a>
              </div>
            </div>
            {playingId === rec.id && (
              <div className="mt-1 rounded-lg bg-gray-800/60 p-2">
                <video
                  src={meetingsApi.getRecordingDownloadUrl(meetingId, rec.id)}
                  controls
                  autoPlay
                  className="w-full rounded"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
