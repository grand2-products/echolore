# AITuber Implementation

Last updated: 2026-05-26

This document describes the currently implemented AITuber behavior — character management, live streaming session, AI response loop, VRM avatar rendering, and motion clip playback.

## Current Scope

- Admin-only character management (text persona + VRM avatar + voice + motion profile)
- Single-active live session per instance, gated by a partial unique index
- LiveKit room with viewer / AI participant tokens
- Server-side event-driven AI response worker with TTS synthesis and emotion / action annotations
- ReAct agent (LangGraph) with viewer-scoped Wiki / Drive tools and per-message citations
- Layered VRM avatar animation: blink, breathing, lip-sync, idle motion, emotion expressions, VRMA motion clips
- Permission-scoped RAG over Wiki + Drive (post-#50, refined in PR-Alpha)

## Implemented Areas

### Frontend

- AITuber landing: `apps/web/app/(main)/aituber/page.tsx`
- Live stage: `apps/web/components/aituber/AituberStage.tsx`
  - tool-call overlay (`"検索中…"` etc.) driven by the `tool-call` data event
  - citation chips rendered from the `ai-complete.citations` payload
  - `session-aborted` overlay when the worker self-terminates
- Viewer chat panel: `apps/web/components/aituber/AituberChat.tsx`
- Avatar canvas: `apps/web/components/aituber/AituberCanvas.tsx` / `AituberAvatar.tsx`
- VRM loader and per-frame controller: `apps/web/components/aituber/VrmModel.tsx`
- Animation pipeline (Compositor + layers): `apps/web/components/aituber/animation/`
- Client store: `apps/web/components/aituber/use-aituber-store.ts`
- Character management UI: `apps/web/app/(main)/aituber/characters/`

### Backend

- Routes: `apps/api/src/routes/aituber.ts`
- AI service (per-message orchestration): `apps/api/src/services/aituber/aituber-ai-service.ts`
- AI worker (event-driven lifecycle): `apps/api/src/services/aituber/aituber-worker.ts`
- Annotation parser: `apps/api/src/services/aituber/aituber-annotations.ts`
- RAG context builder: `apps/api/src/services/aituber/aituber-rag-context.ts`
- Motion manifest loader: `apps/api/src/services/aituber/motion-registry.ts`
- ReAct agent factory: `apps/api/src/ai/agent/create-aituber-agent.ts`
- TTS + viseme synthesis: `apps/api/src/services/aituber/aituber-tts-service.ts`
- LiveKit token / room: `apps/api/src/services/aituber/aituber-livekit-service.ts`
- Character / session / message repository: `apps/api/src/repositories/aituber/aituber-repository.ts`
- Service-layer character / session / message orchestration: `apps/api/src/services/aituber/aituber-service.ts`

### Shared

- Data channel event contract: `packages/shared/src/contracts/index.ts` (`AituberDataEvent`)
- Citation type: same file (`AituberCitation`)
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

### AI Response Loop (event-driven)

- one worker per live session (`aituber-worker.ts`); no polling
- the HTTP route calls `notifyNewMessage(sessionId)` immediately after persisting a viewer message; the worker wakes on an in-process `EventEmitter` channel `message:<sessionId>`
- if a notification is somehow missed, the worker also re-checks every `SAFETY_TICK_MS` (60s)
- per message: `processNextMessage` → resolve viewer SessionUser → build RAG context → invoke ReAct agent (`createAituberAgent`) → stream tokens → parse annotations → save assistant message → TTS per sentence
- the ReAct agent is built on `createReactAgent` (`@langchain/langgraph/prebuilt`) and runs in `streamMode: "messages"` so we can forward AI tokens to viewers in real time while still letting the agent call tools mid-stream
- LLM output is annotated with `[emotion:TYPE:INTENSITY][action:ACTION_ID]` tags; tags are parsed and stripped before the message is shown to viewers
- annotation tags drive separate `emotion` / `action` data events for avatar expression / motion
- maximum 500 output tokens per response; up to 20 messages of history are included
- session-scoped FIFO: messages from concurrent viewers are processed in order

### Tools Available to the Agent

Tools are bound to the agent only when the viewer's `SessionUser` resolves — an unresolved viewer (deleted / suspended / unauthenticated path) receives **zero** tools, so the agent cannot reach outside its caller's permission boundary.

| Tool | Source | Notes |
|---|---|---|
| `wiki_search` | `createAiChatSearchTool(viewer)` | viewer-scoped vector + ilike fallback |
| `wiki_list_pages` | `createAiChatListPagesTool(viewer)` | only pages the viewer can read |
| `wiki_read_page` | `createAiChatReadPageTool(viewer)` | `canReadPage(viewer, ...)` guarded |
| `drive_search` | `createAiChatDriveSearchTool(viewer)` | only added when Drive is enabled and at least one shared drive is configured |
| `drive_read` | `createAiChatDriveReadTool(viewer)` | uses viewer's email for Drive ACL checks |

`lookup_user` was previously included but **removed** (review finding C5): the underlying `/api/users` endpoint is admin-only, so exposing the directory through AITuber would have leaked employee email / role to every viewer in the room.

### RAG (Permission-Scoped)

- viewer's `SessionUser` is resolved from `aituber_messages.senderUserId`; suspended or deleted viewers are treated as unresolved
- Wiki search: `searchVisibleChunks(viewer, query, 3)` — same permission model as Wiki Chat. Both the vector path **and** the `ilike_fallback` path are viewer-scoped (the fallback inherits the same permission filter, refined in PR-Alpha)
- Drive search: `searchDriveForUser(viewer.email, query, 2)` — Drive permission rows filter by the viewer's account
- when the viewer cannot be resolved, RAG is skipped entirely; the loop does **not** fall back to admin-scoped search
- top results (chunk text capped at 300 chars) are injected into the system prompt with `[Wiki: title]` / `[Drive: filename]` headers
- pre-fetched RAG citations are merged with anything the agent pulled in via its tools, deduped by `(source, id)`, and surfaced to viewers on `ai-complete`

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
- `VrmAnimationController` plays VRMA motion clips listed in `public/motions/manifest.json`
- the backend loads that same manifest at runtime via `motion-registry.ts`; the parsed clip list both drives the agent's `actionListing` (advertised in the system prompt) and guards `[action:ID]` tag validation (unknown IDs are dropped before broadcast)

### Data Channel Events (viewer contract)

Defined as `AituberDataEvent` in `packages/shared/src/contracts/index.ts`. Every event emitted by the API is a member of this union; viewers can rely on the shape staying stable.

| Event | Direction | Payload |
|---|---|---|
| `viewer-message` | API → viewer | `messageId`, `senderName`, `content` |
| `ai-token` | API → viewer | `token` (per LLM-stream chunk) |
| `ai-complete` | API → viewer | `messageId`, `fullContent`, optional `citations[]` |
| `avatar-state` | API → viewer | `state` ∈ `idle` / `thinking` / `talking` |
| `emotion` | API → viewer | `emotion` (enum), `intensity` ∈ [0,1] |
| `action` | API → viewer | `action` (VRMA clip id) |
| `tts-audio` | API → viewer | base64 audio + mime + visemes |
| `tool-call` | API → viewer | `toolName`, `phase` ∈ `started` / `finished` |
| `session-aborted` | API → viewer | (none) — fired once when the worker self-terminates |
| `image-share` | API → viewer | url + optional caption |
| `viewer-count` | API → viewer | `count` |

`tool-call` is emitted around each agent tool invocation. The agent may yield the same `tool_call` across multiple chunks; the service de-dups by `tool_call.id` and emits exactly one `started`. A `finished` event is emitted when the matching `ToolMessage` returns, and as a safety net the service flushes `finished` for any still-inflight tool when the stream ends.

### Reliability

- LLM / DB / LiveKit errors are counted; after `MAX_CONSECUTIVE_ERRORS` (10) the worker:
  - broadcasts `session-aborted` so viewers see an overlay instead of a frozen avatar
  - transitions the session `live → ended` via `stopSession` (falling back to `abortSession` for sessions still in `created`)
  - deletes the LiveKit room via `deleteAituberRoom`
- teardown lives in `tearDownAbortedSession` (`aituber-worker.ts`) so the broadcast / DB transition / room delete order is preserved across error paths

### Observability

Backend emits the following structured log events:

| Event | Where |
|---|---|
| `aituber-ai.search` | per-message RAG search (viewer / counts / similarity / searchMode / durationMs) |
| `aituber-ai.search.skipped` | viewer could not be resolved → RAG skipped |
| `aituber-ai.search.wiki-error` | Wiki search half of the parallel call failed |
| `aituber-ai.search.drive-error` | Drive search half of the parallel call failed |
| `aituber-ai.search.error` | both halves failed / outer RAG error |
| `aituber-ai.generate` | LLM stream finished (response chars / tool & RAG citation counts / durationMs) |
| `aituber-ai.error` | per-iteration error with running count |
| `aituber-ai.aborted` | `MAX_CONSECUTIVE_ERRORS` reached |

### Authorization Boundary

- Character read / write follows `isOwnerOrAdmin` + `isPublic`
- Session start / stop is admin-only
- Viewer messages and viewer tokens are open to any authenticated user when the session is `live`
- Live RAG inherits the viewer's read permissions on Wiki and Drive; no privilege escalation across viewers
- **Admin viewers are scope-downgraded to `Member` before processing** (H7, PR-Alpha): AITuber responses are broadcast to every viewer on the LiveKit data channel, so processing an admin's message under their admin role would leak admin-only pages to non-admin viewers. `resolveViewerUser` always overrides `role` to `Member`; admins who need admin-scoped answers use the AI Chat surface (1:1, not broadcast)
- Tools are only bound to the agent when the viewer resolves — an unresolved sender receives the agent without any tools, so they cannot search outside the RAG block we pre-fetched (which is also empty for that case)

## Related Files

- `../docs/wiki-chat-rag.md` — shared RAG infrastructure
- `../docs/wiki-implementation.md` — Wiki permissions / search foundation
- `../docs/site-map.md` — frontend routes including `/aituber`
- `../plan/aituber-motion-sota.md` — remaining VRMA motion clip generation work
