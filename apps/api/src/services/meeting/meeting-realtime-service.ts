import { createSpeechGatewayBundle, resolveSpeechProvider } from "../../ai/gateway/index.js";
import {
  createAgent,
  createMeetingAgentEvent,
  createMeetingAgentSession,
  createTranscriptSegment,
  getActiveMeetingAgentSession,
  getAgentById,
  getTranscriptSegmentByKey,
  listActiveAgents,
  listActiveMeetingAgentSessions,
  listMeetingAgentEvents,
  listTranscriptSegmentsByMeeting,
  updateAgent,
  updateMeetingAgentSession,
  updateTranscriptSegment,
} from "../../repositories/meeting/meeting-realtime-repository.js";

export async function upsertTranscriptSegment(input: {
  meetingId: string;
  participantIdentity: string;
  speakerUserId?: string | null;
  speakerLabel: string;
  content: string;
  isPartial: boolean;
  segmentKey: string;
  provider: string;
  confidence?: number | null;
  startedAt: Date;
  finalizedAt?: Date | null;
}) {
  const existing = await getTranscriptSegmentByKey(input.meetingId, input.segmentKey);

  if (!existing) {
    return createTranscriptSegment({
      id: crypto.randomUUID(),
      meetingId: input.meetingId,
      participantIdentity: input.participantIdentity,
      speakerUserId: input.speakerUserId ?? null,
      speakerLabel: input.speakerLabel,
      content: input.content,
      isPartial: input.isPartial,
      segmentKey: input.segmentKey,
      provider: input.provider,
      confidence: input.confidence ?? null,
      startedAt: input.startedAt,
      finalizedAt: input.finalizedAt ?? null,
      createdAt: new Date(),
    });
  }

  return updateTranscriptSegment(existing.id, {
    speakerUserId: input.speakerUserId ?? existing.speakerUserId,
    speakerLabel: input.speakerLabel,
    content: input.content,
    isPartial: input.isPartial,
    provider: input.provider,
    confidence: input.confidence ?? existing.confidence,
    startedAt: input.startedAt,
    finalizedAt: input.finalizedAt ?? existing.finalizedAt,
  });
}

export async function transcribeMeetingAudioSegment(input: {
  meetingId: string;
  audioBase64: string;
  mimeType: string;
  languageCode: string;
  provider?: string;
  participantIdentity: string;
  speakerUserId?: string | null;
  speakerLabel?: string;
  segmentKey: string;
  startedAt: Date;
  finalizedAt?: Date | null;
}) {
  const provider = resolveSpeechProvider(input.provider);
  const gateways = createSpeechGatewayBundle(provider);
  const sttResult = await gateways.stt.transcribe({
    audio: Buffer.from(input.audioBase64, "base64"),
    mimeType: input.mimeType,
    languageCode: input.languageCode,
    participantIdentity: input.participantIdentity,
    segmentKey: input.segmentKey,
  });

  if (!sttResult.transcript.trim()) {
    return null;
  }

  return upsertTranscriptSegment({
    meetingId: input.meetingId,
    participantIdentity: input.participantIdentity,
    speakerUserId: input.speakerUserId ?? null,
    speakerLabel: input.speakerLabel ?? input.participantIdentity,
    content: sttResult.transcript,
    isPartial: sttResult.isPartial,
    segmentKey: input.segmentKey,
    provider: sttResult.provider,
    confidence: sttResult.confidence ?? null,
    startedAt: input.startedAt,
    finalizedAt: input.finalizedAt ?? null,
  });
}

export async function listRealtimeTranscriptSegments(meetingId: string) {
  return listTranscriptSegmentsByMeeting(meetingId);
}

export async function listAvailableAgents() {
  return listActiveAgents();
}

export async function createAgentDefinition(input: {
  name: string;
  description?: string | null;
  systemPrompt: string;
  voiceProfile?: string | null;
  interventionStyle: string;
  defaultProvider: string;
  isActive?: boolean;
  createdBy: string;
}) {
  const now = new Date();
  return createAgent({
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description ?? null,
    systemPrompt: input.systemPrompt,
    voiceProfile: input.voiceProfile ?? null,
    interventionStyle: input.interventionStyle,
    defaultProvider: input.defaultProvider,
    isActive: input.isActive ?? true,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateAgentDefinition(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    systemPrompt?: string;
    voiceProfile?: string | null;
    interventionStyle?: string;
    defaultProvider?: string;
    isActive?: boolean;
  }
) {
  return updateAgent(id, {
    ...input,
    updatedAt: new Date(),
  });
}

export async function invokeMeetingAgent(input: {
  meetingId: string;
  agentId: string;
  invokedByUserId: string;
}) {
  const agent = await getAgentById(input.agentId);
  if (!agent || !agent.isActive) {
    return null;
  }

  const existingSession = await getActiveMeetingAgentSession(input.meetingId, input.agentId);
  if (existingSession) {
    return {
      agent,
      session: existingSession,
      reused: true,
    };
  }

  const now = new Date();
  const session = await createMeetingAgentSession({
    id: crypto.randomUUID(),
    meetingId: input.meetingId,
    agentId: input.agentId,
    state: "active",
    invokedByUserId: input.invokedByUserId,
    joinedAt: now,
    leftAt: null,
    createdAt: now,
  });

  if (!session) {
    return null;
  }

  await createMeetingAgentEvent({
    id: crypto.randomUUID(),
    meetingId: input.meetingId,
    agentId: input.agentId,
    eventType: "invoked",
    payload: { sessionId: session.id },
    triggeredByUserId: input.invokedByUserId,
    createdAt: now,
  });

  return {
    agent,
    session,
    reused: false,
  };
}

export async function leaveMeetingAgent(input: {
  meetingId: string;
  agentId: string;
  triggeredByUserId: string;
}) {
  const session = await getActiveMeetingAgentSession(input.meetingId, input.agentId);
  if (!session) {
    return null;
  }

  const now = new Date();
  const updatedSession = await updateMeetingAgentSession(session.id, {
    state: "ended",
    leftAt: now,
  });

  await createMeetingAgentEvent({
    id: crypto.randomUUID(),
    meetingId: input.meetingId,
    agentId: input.agentId,
    eventType: "left",
    payload: { sessionId: session.id },
    triggeredByUserId: input.triggeredByUserId,
    createdAt: now,
  });

  return updatedSession;
}

export async function listMeetingAgentTimeline(meetingId: string) {
  return listMeetingAgentEvents(meetingId);
}

export async function listActiveAgentSessions(meetingId: string) {
  return listActiveMeetingAgentSessions(meetingId);
}
