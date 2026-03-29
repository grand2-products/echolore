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
      meeting_id: input.meetingId,
      participant_identity: input.participantIdentity,
      speaker_user_id: input.speakerUserId ?? null,
      speaker_label: input.speakerLabel,
      content: input.content,
      is_partial: input.isPartial,
      segment_key: input.segmentKey,
      provider: input.provider,
      confidence: input.confidence ?? null,
      started_at: input.startedAt,
      finalized_at: input.finalizedAt ?? null,
      created_at: new Date(),
    });
  }

  return updateTranscriptSegment(existing.id, {
    speaker_user_id: input.speakerUserId ?? existing.speaker_user_id,
    speaker_label: input.speakerLabel,
    content: input.content,
    is_partial: input.isPartial,
    provider: input.provider,
    confidence: input.confidence ?? existing.confidence,
    started_at: input.startedAt,
    finalized_at: input.finalizedAt ?? existing.finalized_at,
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
    system_prompt: input.systemPrompt,
    voice_profile: input.voiceProfile ?? null,
    intervention_style: input.interventionStyle,
    default_provider: input.defaultProvider,
    is_active: input.isActive ?? true,
    created_by: input.createdBy,
    created_at: now,
    updated_at: now,
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
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.systemPrompt !== undefined ? { system_prompt: input.systemPrompt } : {}),
    ...(input.voiceProfile !== undefined ? { voice_profile: input.voiceProfile } : {}),
    ...(input.interventionStyle !== undefined
      ? { intervention_style: input.interventionStyle }
      : {}),
    ...(input.defaultProvider !== undefined ? { default_provider: input.defaultProvider } : {}),
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    updated_at: new Date(),
  });
}

export async function invokeMeetingAgent(input: {
  meetingId: string;
  agentId: string;
  invokedByUserId: string;
}) {
  const agent = await getAgentById(input.agentId);
  if (!agent || !agent.is_active) {
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
    meeting_id: input.meetingId,
    agent_id: input.agentId,
    state: "active",
    invoked_by_user_id: input.invokedByUserId,
    joined_at: now,
    left_at: null,
    created_at: now,
  });

  if (!session) {
    return null;
  }

  await createMeetingAgentEvent({
    id: crypto.randomUUID(),
    meeting_id: input.meetingId,
    agent_id: input.agentId,
    event_type: "invoked",
    payload: { sessionId: session.id },
    triggered_by_user_id: input.invokedByUserId,
    created_at: now,
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
    left_at: now,
  });

  await createMeetingAgentEvent({
    id: crypto.randomUUID(),
    meeting_id: input.meetingId,
    agent_id: input.agentId,
    event_type: "left",
    payload: { sessionId: session.id },
    triggered_by_user_id: input.triggeredByUserId,
    created_at: now,
  });

  return updatedSession;
}

export async function listMeetingAgentTimeline(meetingId: string) {
  return listMeetingAgentEvents(meetingId);
}

export async function listActiveAgentSessions(meetingId: string) {
  return listActiveMeetingAgentSessions(meetingId);
}
