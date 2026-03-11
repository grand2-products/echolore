# Realtime AI Employee Plan

Last updated: 2026-03-11
Status: planned

## Goal
Add an in-room "AI employee" that can:
- produce realtime meeting transcript,
- join the room only when explicitly invoked,
- intervene by voice as well as text,
- be defined and managed by admin-role humans,
- use an STT/TTS gateway abstraction with provider choice.

## Product Decisions
- invocation mode: explicit call only
- voice intervention: included in scope
- STT/TTS architecture: gateway-based provider abstraction
- initial provider bias: Google first
- agent management: admin users define and manage agent profiles

## Non-Goals For Initial Slice
- autonomous always-on interruption without explicit invocation
- multi-agent orchestration in the first release
- full agent marketplace or end-user agent authoring
- final provider lock-in at the app layer

## Target Architecture
`LiveKit room -> realtime media/text ingest -> STT/TTS gateway -> agent worker -> API persistence/broadcast -> web UI`

### Components
- `apps/web`
  - room UI
  - live transcript panel
  - agent invocation controls
  - agent response display
- `apps/api`
  - authorization
  - meeting/agent metadata
  - transcript and agent-event persistence
  - operator/admin APIs
- `gateway`
  - provider abstraction for STT/TTS
  - initial Google-backed implementation
- `agent worker`
  - room participation
  - context assembly
  - intervention planning
  - text and voice output

## Core Domain Model Additions
### Realtime transcript
- `meeting_transcript_segments`
  - `id`
  - `meeting_id`
  - `participant_identity`
  - `speaker_user_id` nullable
  - `speaker_label`
  - `content`
  - `is_partial`
  - `segment_key`
  - `provider`
  - `confidence`
  - `started_at`
  - `finalized_at`
  - `created_at`

### Agent events
- `meeting_agent_events`
  - `id`
  - `meeting_id`
  - `agent_id`
  - `event_type`
  - `payload`
  - `triggered_by_user_id`
  - `created_at`

### Agent definitions
- `agents`
  - `id`
  - `name`
  - `description`
  - `system_prompt`
  - `voice_profile`
  - `intervention_style`
  - `default_provider`
  - `is_active`
  - `created_by`
  - `created_at`
  - `updated_at`

### Meeting agent sessions
- `meeting_agent_sessions`
  - `id`
  - `meeting_id`
  - `agent_id`
  - `state`
  - `invoked_by_user_id`
  - `joined_at`
  - `left_at`
  - `created_at`

## WS-1 Realtime Transcript Foundation
### Objective
Stream partial and final transcript into the meeting experience.

### Tasks
- [ ] Define transcript segment schema and migration
- [ ] Add transcript ingest endpoint or worker callback contract
- [ ] Persist partial/final transcript states separately
- [ ] Map LiveKit participant identity to speaker label/user when possible
- [ ] Expose meeting transcript stream/read API
- [ ] Add live transcript panel to room UI

### Definition of done
- room participants can see partial and final transcript updates in near realtime
- transcript data survives reconnects and refreshes

## WS-2 STT/TTS Gateway
### Objective
Hide speech providers behind a stable internal contract.

### Tasks
- [ ] Define internal gateway interfaces for STT and TTS
- [ ] Implement Google-backed STT adapter
- [ ] Implement Google-backed TTS adapter
- [ ] Add provider selection config at agent/profile level
- [ ] Add failure classification and retry policy

### Definition of done
- app and agent worker depend on gateway contracts, not Google SDK directly
- provider can be switched per agent without route/UI rewrite

## WS-3 Explicitly Invoked AI Employee
### Objective
Allow users to call an AI employee into a room on demand.

### Tasks
- [ ] Add agent invocation control in meeting room UI
- [ ] Create agent session when invoked
- [ ] Join AI participant to LiveKit room with a bot identity
- [ ] Support text response path first
- [ ] Support voice response path in the same invocation flow
- [ ] Record invocation and response events in audit/agent event storage

### Definition of done
- a user can explicitly summon an AI employee in a room
- AI employee appears as a participant and responds in text and voice

## WS-4 Agent Decisioning And Intervention
### Objective
Give the AI employee bounded, reviewable intervention behavior.

### Tasks
- [ ] Define intervention triggers for explicit invocation sessions
- [ ] Build context window from recent transcript, meeting title, and current unresolved items
- [ ] Add response modes: summary, action-item proposal, clarification question, risk callout
- [ ] Prevent duplicate/rapid-fire interventions with session state guardrails
- [ ] Add operator-visible event history for why the agent spoke

### Definition of done
- agent interventions are contextual, rate-limited, and explainable
- intervention history is inspectable after the meeting

## WS-5 Admin Agent Management
### Objective
Let admin-role humans define and manage AI employees.

### Tasks
- [ ] Add admin CRUD API for agent definitions
- [ ] Restrict agent definition/mutation to admin users
- [ ] Add admin UI for creating and editing agents
- [ ] Support prompt, voice, provider, and style configuration
- [ ] Add activation/deactivation and default-assignment behavior

### Definition of done
- admins can manage agent profiles without code changes
- non-admin users cannot mutate agent definitions

## WS-6 Meeting Artifacts And Wiki Integration
### Objective
Connect realtime AI employee output back into the existing meeting/wiki flow.

### Tasks
- [ ] Reuse transcript segments for post-meeting summary generation
- [ ] Generate structured decisions/action items from agent event history
- [ ] Allow saving agent notes to wiki blocks
- [ ] Define idempotent handoff from live meeting to post-meeting Room AI summary flow

### Definition of done
- live and post-meeting AI flows share data instead of duplicating pipelines

## Recommended Delivery Order
1. WS-1 Realtime Transcript Foundation
2. WS-2 STT/TTS Gateway
3. WS-3 Explicitly Invoked AI Employee
4. WS-5 Admin Agent Management
5. WS-4 Agent Decisioning And Intervention
6. WS-6 Meeting Artifacts And Wiki Integration

## Suggested MVP Cut
- live transcript panel
- explicit AI invocation button
- one admin-defined agent profile
- Google-backed STT/TTS through gateway contracts
- text + voice response
- event logging and basic session history

## Key Risks
- realtime cost growth from continuous STT/TTS
- latency spikes that make voice intervention feel broken
- transcript speaker attribution quality
- accidental double-speaking or repeated interventions
- provider abstraction leaking provider-specific assumptions

## Open Questions
- should one room allow multiple AI employee sessions at once
- should explicit invocation be limited to meeting owner/admin or any participant
- should AI speech require a user confirmation before speaking aloud
- do we need a "listen only" mode distinct from "respond when called"

## References
- current meeting implementation: `../docs/meeting-tool-implementation.md`
- product backlog: `./todo-master.md`
- implementation status: `./implementation-status-master.md`
