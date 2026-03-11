# Meeting Tool Implementation

Last updated: 2026-03-12

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

### Security
- owner/admin enforcement on read/write/delete
- server-authoritative `creatorId`
- meeting write permission gates agent invocation and agent response routes
- meeting read permission gates transcript, agent event, and active session visibility
- audit logging on meeting record views and pipeline runs

## Known Gaps
- stronger regression test coverage
- realtime transcript worker can receive webhooks and ingest segments, but direct LiveKit audio subscription is still not implemented
- voice synthesis still depends on configured Google Cloud auth at runtime

## Related Files
- `../plan/todo-master.md`
- `../plan/implementation-status-master.md`
