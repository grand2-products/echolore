# AITuber Implementation

Last updated: 2026-05-26

This document describes the currently implemented AITuber behavior — character management, live streaming session, AI response loop, VRM avatar rendering, and motion clip playback.

## Current Scope

- Admin-only character management (text persona + VRM avatar + voice + motion profile)
- Single-active live session per instance, gated by a partial unique index
- LiveKit room with viewer / AI participant tokens
- Server-side AI response loop with TTS synthesis and emotion / action annotations
- Layered VRM avatar animation: blink, breathing, lip-sync, idle motion, emotion expressions, VRMA motion clips
- Permission-scoped RAG over Wiki + Drive (post-#50)

## Implemented Areas

### Frontend

- AITuber landing: `apps/web/app/(main)/aituber/page.tsx`
- Live stage: `apps/web/components/aituber/AituberStage.tsx`
- Viewer chat panel: `apps/web/components/aituber/AituberChat.tsx`
- Avatar canvas: `apps/web/components/aituber/AituberCanvas.tsx` / `AituberAvatar.tsx`
- VRM loader and per-frame controller: `apps/web/components/aituber/VrmModel.tsx`
- Animation pipeline (Compositor + layers): `apps/web/components/aituber/animation/`
- Client store: `apps/web/components/aituber/use-aituber-store.ts`
- Character management UI: `apps/web/app/(main)/aituber/characters/`

### Backend

- Routes: `apps/api/src/routes/aituber.ts`
- AI processing loop: `apps/api/src/services/aituber/aituber-ai-service.ts`
- TTS + viseme synthesis: `apps/api/src/services/aituber/aituber-tts-service.ts`
- LiveKit token / room: `apps/api/src/services/aituber/aituber-livekit-service.ts`
- Character / session / message repository: `apps/api/src/repositories/aituber/aituber-repository.ts`
- Service-layer character / session / message orchestration: `apps/api/src/services/aituber/aituber-service.ts`

### Shared

- Data channel event contract: `packages/shared/src/contracts/index.ts` (`AituberDataEvent`)
- Avatar state / emotion enums: same file (`AituberAvatarState`, `AituberEmotionType`)

## Implemented Behaviors

### Characters

- create, read, update, delete (admin or owner)
- public / private visibility (private characters visible only to owner)
- VRM avatar upload through StorageProvider, resolved via `/api/files/:id/download`
- motion profile JSON stored alongside the character (per-character motion preference)
- TTS preview endpoint for owner / admin

### Sessions

- single-active constraint enforced by `aituber_sessions_single_active` partial unique index
- atomic state transitions: `created → live` (start) and `live → ended` (stop)
- creation and start are admin-only
- LiveKit room created on session start and deleted on stop
- viewer token issued to any authenticated user when the session is `live`
- `session-aborted` data event broadcast when the AI loop self-terminates (see Reliability below)

### AI Response Loop

- backend poll loop (~1s interval) per active session
- viewer message → `processNextMessage` → resolve viewer → build RAG context → LLM stream → TTS per sentence
- LLM output is annotated with `[emotion:TYPE:INTENSITY][action:ACTION_ID]` tags; tags are parsed and stripped before the message is shown to viewers
- annotation tags drive separate `emotion` / `action` data events for avatar expression / motion
- maximum 500 output tokens per response; up to 20 messages of history are included
- session-scoped FIFO: messages from concurrent viewers are processed in order

### RAG (Permission-Scoped)

- viewer's `SessionUser` is resolved from `aituber_messages.senderUserId`; suspended or deleted viewers are treated as unresolved
- Wiki search: `searchVisibleChunks(viewer, query, 3)` — same permission model as Wiki Chat (group / page-level deny / personal space rules all enforced)
- Drive search: `searchDriveForUser(viewer.email, query, 2)` — Drive permission rows filter by the viewer's account
- when the viewer cannot be resolved, RAG is skipped entirely; the loop does **not** fall back to admin-scoped search
- top results (chunk text capped at 300 chars) are injected into the system prompt with `[Wiki: title]` / `[Drive: filename]` headers

### TTS / Lip Sync

- pluggable TTS gateway (Google TTS by default, configurable via admin settings)
- response text is split into sentences; each sentence is synthesized independently
- audio is base64-encoded and sent through the LiveKit data channel as `tts-audio` events
- visemes are generated from a hiragana / Latin phoneme map and shipped alongside the audio for client-side lip-sync; the LipSyncLayer can fall back to live audio analysis if visemes are missing

### Avatar Animation

- VRM 0.x / 1.x models loaded via `@pixiv/three-vrm`
- per-frame `AnimationCompositor` merges contributions from:
  - `BlinkLayer` (MAX merge with other expressions)
  - `BreathingLayer`
  - `IdleMotionLayer` (random idle drift)
  - `LipSyncLayer` (TTS visemes or live audio fallback)
  - `EmotionLayer` (5s hold then auto-fadeout)
  - `StateExpressionLayer` (thinking / talking / idle)
- `LookAtController` drives gaze drift via fbm noise
- `VrmAnimationController` plays VRMA motion clips listed in `public/motions/manifest.json`; clip selection is driven by the LLM-emitted `[action:ID]` tag
- Currently the backend ships a hardcoded `ACTION_REGISTRY` that must be kept in sync with `manifest.json` (see [#55](https://github.com/grand2-products/echolore/issues/55))

### Reliability

- LLM / DB / LiveKit errors are counted; after `MAX_CONSECUTIVE_ERRORS` (10) the loop:
  - transitions the session `live → ended` via `stopSession`
  - deletes the LiveKit room via `deleteAituberRoom`
  - broadcasts `session-aborted` so viewers see an overlay instead of a frozen avatar
- See [#54](https://github.com/grand2-products/echolore/issues/54) for the planned move from polling to event-driven scheduling.

### Observability

Backend emits the following structured log events:

| Event | Where |
|---|---|
| `aituber-ai.search` | per-message RAG search (viewer / counts / similarity / searchMode / durationMs) |
| `aituber-ai.search.skipped` | viewer could not be resolved → RAG skipped |
| `aituber-ai.search.wiki-error` / `.drive-error` | one side of the parallel search failed |
| `aituber-ai.generate` | LLM stream finished (response chars / durationMs) |
| `aituber-ai.error` | per-iteration error with running count |
| `aituber-ai.aborted` | `MAX_CONSECUTIVE_ERRORS` reached |

### Authorization Boundary

- Character read / write follows `isOwnerOrAdmin` + `isPublic`
- Session start / stop is admin-only
- Viewer messages and viewer tokens are open to any authenticated user when the session is `live`
- Live RAG inherits the viewer's read permissions on Wiki and Drive; no privilege escalation across viewers

## Related Files

- `../docs/wiki-chat-rag.md` — shared RAG infrastructure
- `../docs/wiki-implementation.md` — Wiki permissions / search foundation
- `../docs/site-map.md` — frontend routes including `/aituber`
- `../plan/aituber-motion-sota.md` — remaining VRMA motion clip generation work
