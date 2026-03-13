# Meeting Tool Implementation

Last updated: 2026-03-13

This document describes the currently implemented meeting tool behavior.

## Current Scope
- Meetings CRUD exists
- LiveKit integration exists
- Meeting detail includes transcripts and summaries
- Room AI MVP exists from transcript to summary to Wiki
- Realtime transcript and explicit AI employee controls exist in the meeting room UI
- Owner/admin authorization is enforced on meeting resources

## Current Frontend
- Meeting list: `apps/web/app/(main)/meetings/page.tsx`
- Meeting detail: `apps/web/app/(main)/meetings/[id]/page.tsx`
- API client: `apps/web/lib/api.ts`
- LiveKit helper: `apps/web/lib/livekit.ts`

## Current Backend
- Meeting routes: `apps/api/src/routes/meetings.ts`
- Authorization: `apps/api/src/policies/authorization-policy.ts`
- Auth/session: `apps/api/src/lib/auth.ts`
- AI summary generation: `apps/api/src/ai/meeting-summary.ts`
- Speech gateway and internal ingest: `apps/api/src/ai/gateway/*`, `apps/api/src/routes/internal-room-ai.ts`
- Worker scaffold and webhook receiver: `apps/worker/src/*`
- Schema: `apps/api/src/db/schema.ts`

## Implemented Behaviors

### Meetings
- list meetings
- get meeting detail
- create meeting
- update meeting
- delete meeting

### Records
- add transcript
- add summary
- view transcripts and summaries from meeting detail

### Room AI MVP
- generate summary from existing transcripts
- create summary record
- create linked Wiki page
- write summary into Wiki blocks
- write audit log for pipeline execution

### Realtime AI Employee Foundation
- persist realtime transcript segments with partial/final state
- poll and display live transcript in the meeting room UI
- admin CRUD exists for agent definitions
- explicit agent invocation exists in the meeting room UI
- persist agent session and event timeline records
- expose active agent sessions through `GET /api/meetings/:id/agents/active`
- generate text response and optional TTS audio through the speech gateway path
- connect an AI agent bot participant to LiveKit when invoked
- play synthesized voice responses in the room UI when audio is available
- operator can see active agent status, invoke an agent, and leave an active agent session from the room UI
- worker can resolve `roomName -> meeting`, receive LiveKit webhooks, and ingest transcript segments through internal routes

### Reactions (Stamps)
- `apps/web/components/livekit/ReactionPicker.tsx` renders the emoji picker UI
- `apps/web/components/livekit/ReactionOverlay.tsx` renders floating reaction animations over the room view
- `apps/web/lib/use-reactions.ts` hook sends and receives reactions through the LiveKit data channel on topic `"reaction"`
- reactions are broadcast to all room participants as ephemeral P2P messages; they are not persisted

### Screen Share Annotations
- `apps/web/lib/useScreenAnnotation.ts` hook manages annotation state and data channel messaging on topic `"screen-annotation"`
- `apps/web/components/livekit/ScreenShareAnnotationOverlay.tsx` renders a transparent canvas overlay on top of the shared screen surface; participants draw markers that are synchronized in real time
- `apps/web/components/livekit/AnnotationToolbar.tsx` provides tool selection (pen, highlighter, pointer) and color controls
- `apps/web/components/livekit/ScreenShareView.tsx` composites the screen share track with the annotation overlay
- annotation strokes are broadcast to all participants via the data channel; they are not persisted

### Recording
- `apps/api/src/services/meeting/recording-service.ts` wraps `EgressClient` to start/stop room composite recordings via LiveKit Egress
- `apps/api/src/routes/livekit-webhook.ts` receives LiveKit webhooks; on egress completion it updates the recording status in the database and triggers auto-transcription
- `apps/api/src/services/meeting/recording-transcription-service.ts` sends the finished MP4 to Gemini multimodal STT and writes the resulting transcript segments
- `meetingRecordings` table in the DB schema stores recording metadata, egress status, and file location
- when a meeting has no realtime transcript segments, the summary pipeline falls back to STT transcripts produced from recordings

### Security
- owner/admin enforcement on read/write/delete
- server-authoritative `creatorId`
- meeting write permission gates agent invocation and agent response routes
- meeting read permission gates transcript, agent event, and active session visibility
- audit logging on meeting record views and pipeline runs

## Future: Marker Persistence (Burn-in)

Currently, screen share annotations are ephemeral — they exist only as real-time
data channel messages and fade after a few seconds. They are **not** burned into
recordings.

### Design for Burn-in

To persist annotations into recordings, the approach would be:

1. **Custom Egress Layout**: LiveKit Egress supports a `customBaseUrl` parameter
   for `RoomCompositeEgress`. A custom HTML layout can overlay annotations on the
   composited video. The layout page subscribes to the `"screen-annotation"` data
   channel topic and renders marks on a transparent canvas layer.

2. **Implementation Steps**:
   - Create a static HTML page at `apps/egress-layout/index.html`
   - The page uses `livekit-client` SDK to join the room read-only
   - Subscribe to `"screen-annotation"` data channel
   - Render annotations on a canvas overlaying the screen share track
   - Serve via a container or static file server reachable from `livekit-egress`
   - Pass `customBaseUrl` to `startRoomCompositeEgress` in `recording-service.ts`

3. **Alternative**: Post-process approach — store annotation events in DB with
   timestamps, then overlay using ffmpeg after recording completes. Simpler to
   implement but adds processing delay.

### Current State

Annotations work in real-time for all participants but are not captured in
recordings. This is documented as a known limitation.

## Known Gaps
- stronger regression test coverage
- realtime transcript worker can receive webhooks and ingest segments, but direct LiveKit audio subscription is still not implemented
- voice synthesis still depends on configured Google Cloud auth at runtime

## Related Files
- `../docs/site-map.md`
- `../docs/product-overview.md`
