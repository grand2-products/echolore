# AI Meeting Intervention — Gap Closure Plan

## Problem Statement

The meeting AI agent concept ("AI employee joins the meeting and intervenes") has solid data model and LLM layers, but the LiveKit integration layer is non-functional. The agent cannot actually join the room, listen to audio, or speak to participants. The current behavior is closer to an HTTP chatbot than an in-meeting participant.

## Gap Summary

| # | Gap | Impact | Priority |
|---|-----|--------|----------|
| G1 | Agent LiveKit token rejected (identity mismatch) | Agent cannot join room at all | P0 |
| G2 | No audio publish path to LiveKit room | Other participants cannot hear the agent | P0 |
| G3 | Worker cannot subscribe to audio tracks | No real-time STT input for autonomous eval | P1 |
| G4 | Autonomous eval reads DB only, not live stream | High latency between speech and intervention | P2 |
| G5 | Autonomous loop runs in API process | No independent scaling | P3 |

---

## G1: Agent LiveKit Token Issuance

### Current Behavior

`apps/api/src/routes/livekit.ts:49` rejects any `participantIdentity` that does not match `user.id`. The frontend requests a token with `participantIdentity: agent-{meetingId}-{agentId}`, which is always rejected (403).

### Target Behavior

Agent receives a valid LiveKit token and joins the room as a visible participant.

### Approach: Server-Side Token Generation

The API server generates the agent token at invoke time and returns it in the invoke response. The frontend uses this pre-generated token instead of calling `/api/livekit/token`.

#### Steps

1. **Add `generateAgentLiveKitToken()` in `meeting-realtime-service.ts`**
   - Uses `livekit-server-sdk` `AccessToken` directly (already imported in `livekit.ts`)
   - Identity: `agent-{meetingId}-{agentId}`
   - Name: `{agentName} (AI)`
   - Grants: `roomJoin`, `canSubscribe`, `canPublishData`, `canPublish` (audio only via grant metadata if possible, otherwise full publish)
   - No identity validation against `user.id`

2. **Modify `invokeMeetingAgent()` return value**
   - Add `livekitToken` and `livekitUrl` fields to the invoke response
   - Token is generated server-side, not via the `/token` endpoint

3. **Update `POST /api/meetings/:id/agents/:agentId/invoke` route**
   - Return `{ agent, session, reused, livekitToken, livekitUrl }`

4. **Update frontend `connectAgentParticipant()`**
   - Use the token from the invoke response instead of calling `fetchLiveKitToken()`
   - Remove the `fetchLiveKitToken` call for agent connections

5. **Add token signing validation**
   - Only generate agent tokens for verified invoke requests (already behind `authorizeOwnerResource`)
   - Log agent token issuance for audit

#### Files Changed

- `apps/api/src/services/meeting/meeting-realtime-service.ts`
- `apps/api/src/routes/meetings/meeting-agents.ts`
- `apps/web/app/(main)/meetings/[id]/page.tsx`
- `packages/shared/src/contracts/index.ts` (invoke response DTO)

#### Acceptance Criteria

- [ ] Agent appears as a participant in LiveKit room after invoke
- [ ] Other participants see `{agentName} (AI)` in the participant list
- [ ] Agent disconnects on leave
- [ ] Unauthorized users cannot obtain agent tokens

---

## G2: Agent Voice Output via LiveKit

### Current Behavior

TTS audio is returned as base64 over HTTP. Only the requesting user's browser plays it locally. Other participants hear nothing.

### Target Behavior

Agent speech is broadcast to all participants in the LiveKit room via audio track.

### Approach A: Server-Side Audio Track Publish (Preferred)

Use LiveKit Server SDK to publish audio directly to the room.

#### Steps

1. **Create `AgentAudioPublisher` service**
   - Uses LiveKit Server SDK `RoomService` or Egress-style API
   - Takes TTS audio buffer → publishes as audio track to the agent's participant identity
   - Alternatively: use `livekit-server-sdk` `DataWriter` or custom SIP track injection

2. **Investigate LiveKit Server SDK capabilities**
   - Check if `RoomService.sendData()` can deliver audio to all participants
   - If not, evaluate LiveKit Agents SDK (`@livekit/agents`) as a separate worker that publishes audio
   - The Agent worker connects as the agent participant and publishes `LocalAudioTrack`

3. **Modify `generateMeetingAgentResponse()` flow**
   - After TTS synthesis, publish audio to LiveKit room (not just return base64)
   - Still return text response to frontend for timeline display

4. **Frontend: play agent audio via LiveKit subscription**
   - Remove local `Audio` playback from `AgentPanel`
   - Agent audio arrives as a regular remote audio track — auto-played by LiveKit

#### Approach B: Frontend Relay via DataChannel

If server-side audio publish is not feasible via the Server SDK:

1. Agent participant (already connected from G1) receives audio data via DataChannel from the API
2. Frontend creates a `LocalAudioTrack` from the TTS audio and publishes it on behalf of the agent

This is less clean but avoids needing a separate worker process.

#### Acceptance Criteria

- [ ] All room participants hear agent speech through LiveKit audio
- [ ] No dependency on local browser Audio API
- [ ] Works for both manual and autonomous interventions

---

## G3: Real-Time Audio Ingestion via Worker

### Current Behavior

`docs/meeting-tool-implementation.md` states: "direct LiveKit audio subscription is still not implemented." Transcription depends on client-side submission or post-recording STT.

### Target Behavior

Worker subscribes to participant audio tracks in real-time, performs STT, and writes transcript segments to DB. Autonomous agent evaluates on near-live transcripts.

### Approach: LiveKit Agents SDK Worker

Use `@livekit/agents` (Python or Node) to create a worker that joins rooms and processes audio.

#### Steps

1. **Create `apps/agent-worker/` package**
   - New package in the monorepo
   - Uses `@livekit/agents` + `@livekit/agents-plugin-silero` (VAD)
   - Connects to rooms when scheduled meetings start (or via webhook trigger)

2. **Worker joins room as hidden participant**
   - Identity: `worker-{meetingId}`
   - `autoSubscribe: true` for audio tracks
   - Subscribes to each participant's `RemoteAudioTrack`

3. **Audio pipeline**
   - VAD to detect speech segments
   - Stream audio chunks to Google STT (streaming recognition)
   - Write finalized segments to API via `POST /internal/room-ai/meetings/:id/transcript-segments`

4. **Worker lifecycle management**
   - Triggered by Room AI Worker webhook (`room_started`) or monitor poll
   - Worker leaves when room empties or meeting ends

5. **Docker Compose addition**
   - Add `agent-worker` service to `docker-compose.yml` and production compose
   - Shares `ROOM_AI_WORKER_SECRET` with API

#### Alternative: Extend Existing Worker

Add LiveKit client SDK to `apps/worker/` instead of creating a new package. Less separation of concerns but simpler deployment.

#### Acceptance Criteria

- [ ] Worker subscribes to participant audio in real-time
- [ ] Transcript segments appear in DB within 2-3 seconds of speech
- [ ] Autonomous agent evaluates on live transcripts (not just post-hoc DB reads)
- [ ] Worker auto-leaves when room empties

---

## G4: Reduce Autonomous Evaluation Latency

### Current Behavior

Autonomous loop polls DB every 20s. It only sees `finalized` transcript segments. Combined with STT latency, total intervention latency can exceed 30s.

### Target Behavior

Autonomous evaluation triggers on new transcript segment arrival, not on a fixed timer.

### Approach: Event-Driven Evaluation

#### Steps

1. **Add evaluation trigger to transcript segment creation**
   - In `upsertTranscriptSegment()`, when a segment is finalized and an active autonomous session exists, queue an evaluation
   - Use an in-process event emitter or lightweight queue (Valkey pub/sub)

2. **Replace `setInterval` with event-driven evaluation**
   - Keep the interval as a fallback safety net (e.g., every 60s)
   - Primary trigger: new finalized segment event
   - Still enforce cooldown and minimum segment count

3. **Move autonomous loop out of API process**
   - Extract to the agent-worker (G3) or a dedicated `autonomous-eval-worker`
   - API publishes `transcript.finalized` events to Valkey channel
   - Worker subscribes and runs evaluation

#### Acceptance Criteria

- [ ] Autonomous evaluation triggers within 5s of sufficient new transcript data
- [ ] Fixed interval is a fallback only, not the primary trigger
- [ ] API process is not blocked by evaluation work

---

## G5: Autonomous Loop Scalability

### Current Behavior

`startAutonomousAgentLoop()` runs as a `setInterval` inside the API server process. If the API scales to multiple instances, each runs its own loop.

### Target Behavior

Single active evaluator instance, resilient to API scaling.

### Approach: Leader Election via Valkey

#### Steps

1. **Add leader election to autonomous loop**
   - Use Valkey `SET NX` with TTL for leader lock
   - Only the lock holder runs the evaluation tick
   - Lock auto-expires if the holder crashes

2. **Alternative: extract to separate process**
   - Move autonomous evaluation to the agent-worker (G3)
   - This is the cleaner long-term solution but depends on G3

#### Acceptance Criteria

- [ ] Only one evaluator instance runs at a time across API replicas
- [ ] Failover within one tick interval if leader crashes

---

## Implementation Order

```
G1 (token fix) → G2 (audio publish) → G3 (worker audio sub) → G4 (event-driven eval) → G5 (scalability)
```

G1 and G2 can be merged into one PR. G3 is the largest work item and may require evaluating LiveKit Agents SDK compatibility. G4 and G5 depend on G3 infrastructure.

### Dependency Graph

```
G1 ──→ G2
         \
G3 ──────→ G4 ──→ G5
```

G1+G2 can proceed independently of G3, but the full "AI joins and speaks" experience requires G2. G4/G5 are optimizations that depend on G3's worker infrastructure.

---

## Open Decisions

- **LiveKit Agents SDK vs Server SDK for audio publish (G2)**: Need spike to determine if Server SDK can publish audio tracks, or if a LiveKit Agents worker is required
- **Node vs Python for agent-worker (G3)**: `@livekit/agents` has Node support but Python ecosystem is more mature for audio processing
- **Valkey pub/sub vs in-process events (G4)**: If G3 creates a separate worker, Valkey is the natural choice. If evaluation stays in API, in-process is simpler
- **Agent participant visibility**: Should agent participants be visible to all users or hidden? Currently visible but this is a UX decision

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| LiveKit Server SDK cannot publish audio tracks | Medium | Spike before G2; fallback to Agents SDK worker |
| STT latency too high for real-time autonomous eval | Low | Google streaming STT is sub-second; VAD reduces false triggers |
| Agent-worker adds significant operational complexity | Medium | Start as extension of existing `apps/worker/`; separate package later |
| Audio publish creates echo/feedback loops | Medium | Agent participant should not subscribe to its own audio; mute echo cancellation |
