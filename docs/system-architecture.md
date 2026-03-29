# System Architecture

Last updated: 2026-03-13

This document describes the currently implemented system architecture of `echolore`.

## Runtime Components
- `apps/web`: Next.js frontend
- `apps/api`: Hono API
- PostgreSQL: primary database
- LiveKit: realtime meeting infrastructure
- `livekit-egress`: LiveKit Egress service for room composite recording (MP4 output)
- Valkey: LiveKit support service
- File storage: pluggable provider (Local filesystem / S3-compatible / GCS), selectable from admin settings
- Traefik: ingress and TLS termination (Let's Encrypt ACME)
- Auth.js: browser session management (JWT via @hono/auth-js)

## Current Runtime Shape
- users access the web frontend directly; browser Google SSO and password login are handled by Auth.js (JWT sessions), or through API-issued access tokens for mobile Google token exchange
- the frontend talks to the backend API over protected application routes
- the API persists business data in PostgreSQL
- the API stores files via a pluggable StorageProvider (local filesystem by default; S3-compatible or GCS can be configured from the admin settings UI at runtime)
- meeting features depend on LiveKit and related services

## Current Deployment Shape
- runtime services are deployed with `docker-compose.yml` on any Linux VPS or server
- container images are published to GHCR (`ghcr.io`)
- Traefik handles TLS termination with automatic Let's Encrypt certificate provisioning, including LiveKit WebSocket signaling (wss:// via `/rtc` path route)
- DB migrations run automatically during each release (forward-only SQL migrations run on startup via Kysely migrator)
- all containers use `restart: unless-stopped`; a systemd unit restores the stack after reboot
- AI credentials (Gemini, Vertex AI, Speech) use API keys configured via environment variables
- local-only overrides live in `docker-compose.dev.yml`
- release operations are executed through GitHub Actions workflows
- VPS initial setup is handled by `scripts/setup/vps-init.sh`

## Current Trust Boundaries
- Google SSO identity enters through Auth.js Google provider
- mobile Google identity can also enter directly through API-side ID token verification
- password identities and verification tokens are issued and verified by the API
- `users.email` is the canonical external identity key across Google SSO and password auth
- registration (password and Google SSO) is gated: open only when the `users` table is empty; the first registered user is auto-promoted to `admin`; after that, self-registration is closed
- API access tokens are signed by the API and can be transported by browser cookie or bearer header
- refresh tokens are hashed DB records in `auth_refresh_tokens`, rotate on refresh, and are user-revocable from the settings screen
- protected API routes now have regression coverage for bearer-token auth acceptance
- password-authenticated state-changing API requests require same-origin `Origin` or `Referer`
- API-side auth and authz remain server-authoritative
- admin-only backend behavior is enforced on `/api/admin/*`
- resource authorization is enforced in wiki, meetings, files, and users routes

## Current Repository Topology
- `apps/web`: frontend
- `apps/api`: backend
- `packages/shared`: shared contracts
- `packages/ui`: shared UI package
- `scripts/setup/`: VPS initial setup
- `scripts/release/`: release runtime scripts
- `.github/workflows/`: release control plane

## Related Durable Docs
- `./product-overview.md`
- `./technical-baseline.md`
- `./release-workflows.md`
- `./ops-runbook.md`
- `./observability-architecture.md`
- `./rollback-recovery-architecture.md`
- `./enterprise-deployment-guide.md`

## LangChain Agent Architecture
- the AI agent subsystem uses LangChain.js with a tool-calling Agent pattern
- agent creation uses LangGraph `createReactAgent` (`apps/api/src/ai/agent/create-meeting-agent.ts`)
- LLM provider abstraction is handled by a factory (`apps/api/src/ai/llm/create-chat-model.ts`) that resolves the configured provider; currently supported providers are Google Gemini (API key), Vertex AI, and Z.ai GLM-5 (via ChatOpenAI-compatible endpoint)
- the agent is equipped with tools (`apps/api/src/ai/tools/`) for wiki search, meeting transcript retrieval, and user lookup
- tool invocations are managed by LangGraph's agent executor, which handles the LLM-tool call loop automatically
- Speech Gateway (`apps/api/src/ai/gateway/`) integrates Google Cloud Speech-to-Text and Text-to-Speech for realtime meeting transcript ingest and voice synthesis

## LiveKit Data Channel Architecture
- the meeting room UI uses LiveKit's built-in data channel API for ephemeral P2P messaging between participants
- each message type is isolated by topic: `"reaction"` for emoji stamps, `"screen-annotation"` for annotation strokes
- messages are broadcast to all room participants; the server does not store or relay them beyond the LiveKit SFU

## Recording & Transcription Webhook Flow
- LiveKit Egress records room audio/video as MP4 files
- on egress completion, LiveKit sends a webhook to `POST /api/livekit/webhook`
- the webhook handler updates the `meetingRecordings` row status and triggers the auto-transcription pipeline
- `recording-transcription-service.ts` sends the MP4 to Gemini multimodal STT and persists the resulting transcript segments
- the AI summary pipeline uses these STT transcripts as a fallback when no realtime transcript segments exist for a meeting

## Known Gaps
- (none)
