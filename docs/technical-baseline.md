# Technical Baseline

Last updated: 2026-03-13

This document records the currently adopted technical baseline for the repository.

## Runtime Baseline
- Web: Next.js
- API: Hono
- ORM: Drizzle ORM
- Database: PostgreSQL
- Realtime: LiveKit
- Cache/broker: Valkey
- Auth: Auth.js (JWT sessions via @hono/auth-js) for browser Google SSO and password login, with API-issued access/refresh tokens for mobile Google token exchange
- AI Agent: LangChain.js (`@langchain/core`, `@langchain/google-vertexai`, `@langchain/community`)
- File storage: pluggable StorageProvider — Local (default, `FILE_STORAGE_PATH`), S3-compatible, or GCS; selectable at runtime from admin settings
- Infra baseline: any Linux VPS + Docker Compose + Traefik (TLS via Let's Encrypt)

## Repository Baseline
- package manager: `pnpm`
- monorepo task runner: Turborepo
- shared contracts: `packages/shared`
- shared UI package: `packages/ui`

## Delivery Baseline
- release path is GitHub Actions workflow only
- CI triggers App Release
- runtime deploy uses prebuilt images
- DB migrations run automatically during each release (drizzle-orm programmatic migrator)
- AI credentials (Gemini, Vertex AI, Speech) use API keys configured via environment variables
- `docker-compose.yml` is the runtime compose
- `docker-compose.dev.yml` is the local development override
- VPS initial setup is handled by `scripts/setup/vps-init.sh`

## Current External Platform Choices
- hosting: any Linux VPS (provider-agnostic)
- file storage: pluggable (Local / S3-compatible / GCS), configured via admin UI and persisted in `site_settings`
- container registry: GHCR (`ghcr.io`)
- authentication provider: Google SSO through Auth.js, plus API-managed email/password auth with verification and mobile Google ID token exchange; self-registration is gated to zero-user bootstrap only, with first-user auto-promotion to admin
- mobile Google clients can exchange verified Google ID tokens directly with the API
- AI agent LLM providers: Google Gemini (via API key), Vertex AI, Z.ai GLM-5
- speech/transcript path: Google Cloud Speech-to-Text (API key)
- runtime image registry: GHCR tags in GitHub Actions workflows

## Current Constraints
- frontend and API contracts should stay aligned through `packages/shared`
- auth and authz remain server-authoritative
- API-issued auth uses signed access tokens, hashed refresh tokens, route-level rate limiting, same-origin CSRF protection for cookie transport, and user-visible session revocation
- local development and runtime deployment use different compose entrypoints

## Known Gaps
- regression test coverage is still below release-grade expectations
- some older planning documents still contain architecture intent that should be reduced over time

## Related Files
- `../docs/release-workflows.md`
- `../docs/ops-runbook.md`
- `../docs/observability-architecture.md`
- `../docs/rollback-recovery-architecture.md`
- `../AGENTS.md`
