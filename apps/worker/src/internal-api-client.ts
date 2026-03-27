import { readFile } from "node:fs/promises";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status >= 500 && attempt < retries) {
        const delay = RETRY_BASE_MS * 2 ** (attempt - 1);
        console.warn(
          `[api-client] ${init.method ?? "GET"} ${url} returned ${response.status}, retrying in ${delay}ms (${attempt}/${retries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt < retries) {
        const delay = RETRY_BASE_MS * 2 ** (attempt - 1);
        console.warn(
          `[api-client] ${init.method ?? "GET"} ${url} failed, retrying in ${delay}ms (${attempt}/${retries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error("fetchWithRetry: unreachable");
}

export type SubmitAudioForTranscriptionInput = {
  apiBaseUrl: string;
  workerSecret: string;
  meetingId: string;
  participantIdentity: string;
  speakerLabel: string;
  segmentKey: string;
  filePath: string;
  mimeType: string;
  languageCode: string;
  speakerUserId?: string;
};

export type ResolveMeetingByRoomNameInput = {
  apiBaseUrl: string;
  workerSecret: string;
  roomName: string;
};

export type SubmitTranscriptSegmentInput = {
  apiBaseUrl: string;
  workerSecret: string;
  meetingId: string;
  participantIdentity: string;
  speakerLabel: string;
  content: string;
  isPartial?: boolean;
  segmentKey: string;
  provider: string;
  confidence?: number | null;
  speakerUserId?: string | null;
  startedAt?: string;
  finalizedAt?: string | null;
};

export type SyncMeetingStatusInput = {
  apiBaseUrl: string;
  workerSecret: string;
  meetingId: string;
  status: "scheduled" | "active" | "ended";
  startedAt?: string | null;
  endedAt?: string | null;
};

export type TrackParticipantJoinInput = {
  apiBaseUrl: string;
  workerSecret: string;
  meetingId: string;
  participantIdentity: string;
  displayName: string;
  isGuest: boolean;
};

export type TrackParticipantLeaveInput = {
  apiBaseUrl: string;
  workerSecret: string;
  meetingId: string;
  participantIdentity: string;
};

export type ListMeetingsByStatusInput = {
  apiBaseUrl: string;
  workerSecret: string;
  status: "scheduled" | "active" | "ended";
};

async function parseJsonOrThrow(response: Response) {
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `Internal API request failed with status ${response.status}`
    );
  }

  return payload;
}

export async function resolveMeetingByRoomName(input: ResolveMeetingByRoomNameInput) {
  const response = await fetchWithRetry(
    `${input.apiBaseUrl}/internal/room-ai/meetings/by-room/${encodeURIComponent(input.roomName)}`,
    {
      headers: {
        "x-room-ai-worker-secret": input.workerSecret,
      },
    }
  );

  const payload = await parseJsonOrThrow(response);
  return payload.meeting as {
    id: string;
    roomName: string;
    title: string;
    status: string;
    startedAt: string | null;
    endedAt: string | null;
  };
}

export async function listMeetingsByStatus(input: ListMeetingsByStatusInput) {
  const response = await fetchWithRetry(
    `${input.apiBaseUrl}/internal/room-ai/meetings?status=${input.status}`,
    {
      headers: {
        "x-room-ai-worker-secret": input.workerSecret,
      },
    }
  );

  const payload = await parseJsonOrThrow(response);
  return payload.meetings as Array<{
    id: string;
    roomName: string;
    title: string;
    status: string;
    startedAt: string | null;
    endedAt: string | null;
  }>;
}

export async function submitAudioFileForTranscription(input: SubmitAudioForTranscriptionInput) {
  const audio = await readFile(input.filePath);
  const response = await fetchWithRetry(
    `${input.apiBaseUrl}/internal/room-ai/meetings/${input.meetingId}/transcribe`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-room-ai-worker-secret": input.workerSecret,
      },
      body: JSON.stringify({
        audioBase64: audio.toString("base64"),
        mimeType: input.mimeType,
        languageCode: input.languageCode,
        provider: "google",
        participantIdentity: input.participantIdentity,
        speakerUserId: input.speakerUserId ?? null,
        speakerLabel: input.speakerLabel,
        segmentKey: input.segmentKey,
        startedAt: new Date().toISOString(),
        finalizedAt: new Date().toISOString(),
      }),
    }
  );
  return parseJsonOrThrow(response);
}

export async function submitTranscriptSegment(input: SubmitTranscriptSegmentInput) {
  const response = await fetchWithRetry(
    `${input.apiBaseUrl}/internal/room-ai/meetings/${input.meetingId}/transcript-segments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-room-ai-worker-secret": input.workerSecret,
      },
      body: JSON.stringify({
        participantIdentity: input.participantIdentity,
        speakerUserId: input.speakerUserId ?? null,
        speakerLabel: input.speakerLabel,
        content: input.content,
        isPartial: input.isPartial ?? false,
        segmentKey: input.segmentKey,
        provider: input.provider,
        confidence: input.confidence ?? null,
        startedAt: input.startedAt ?? new Date().toISOString(),
        finalizedAt: input.finalizedAt ?? new Date().toISOString(),
      }),
    }
  );

  return parseJsonOrThrow(response);
}

export async function trackParticipantJoin(input: TrackParticipantJoinInput) {
  const response = await fetchWithRetry(
    `${input.apiBaseUrl}/internal/room-ai/meetings/${input.meetingId}/participants/join`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-room-ai-worker-secret": input.workerSecret,
      },
      body: JSON.stringify({
        participantIdentity: input.participantIdentity,
        displayName: input.displayName,
        isGuest: input.isGuest,
      }),
    }
  );

  return parseJsonOrThrow(response);
}

export async function trackParticipantLeave(input: TrackParticipantLeaveInput) {
  const response = await fetchWithRetry(
    `${input.apiBaseUrl}/internal/room-ai/meetings/${input.meetingId}/participants/leave`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-room-ai-worker-secret": input.workerSecret,
      },
      body: JSON.stringify({
        participantIdentity: input.participantIdentity,
      }),
    }
  );

  return parseJsonOrThrow(response);
}

export async function syncMeetingStatus(input: SyncMeetingStatusInput) {
  const response = await fetchWithRetry(
    `${input.apiBaseUrl}/internal/room-ai/meetings/${input.meetingId}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-room-ai-worker-secret": input.workerSecret,
      },
      body: JSON.stringify({
        status: input.status,
        startedAt: input.startedAt ?? null,
        endedAt: input.endedAt ?? null,
      }),
    }
  );

  return parseJsonOrThrow(response);
}
