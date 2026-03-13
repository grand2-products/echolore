# corp-internal

Internal collaboration platform for grand2 Products.

## Overview
- Google SSO and email/password access
- Block-based Wiki
- Meetings with LiveKit
- Room AI flow from transcript to summary to Wiki

## Monorepo
- `apps/web`: Next.js frontend
- `apps/api`: Hono API
- `packages/shared`: shared contracts and DTOs
- `packages/ui`: shared UI package
- `scripts/setup/`: VPS initial setup

## Runtime Stack
- Web: Next.js
- API: Hono + Drizzle ORM
- DB: PostgreSQL
- Realtime: LiveKit
- Cache/broker: Valkey
- Auth: Auth.js (JWT sessions via @hono/auth-js)
- Mobile-ready auth: API-issued bearer access tokens with refresh rotation for email/password and Google token exchange
- File storage: pluggable (Local / S3 / GCS)
- Infra baseline: any Linux VPS + Docker Compose + Traefik
- Container registry: GHCR (ghcr.io)

## Local Development
1. Install dependencies
   - `pnpm install`
2. Prepare environment
   - copy `apps/api/.env.example` to `apps/api/.env`
   - copy `apps/web/.env.local.example` to `apps/web/.env.local`
   - copy `apps/worker/.env.example` to `apps/worker/.env`
   - copy `.env.example` to `.env` only if you need root orchestration overrides
   - keep app env files explicit: if you change a local port, update the related localhost URL values in the same file as well
   - set `AUTH_SECRET` in `apps/api/.env` (required for Auth.js JWT signing)
   - set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `apps/api/.env` for browser Google SSO
   - app dev scripts read their own `.env` files directly
   - local development uses the real auth flow; there is no API-side auth bypass user
   - password registration and sign-in are available at `/login`
   - local development writes email verification links to the API log; `APP_BASE_URL` controls the generated link target
   - shared environments can send verification mail by setting `RESEND_API_KEY` and `RESEND_FROM`, or fall back to `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `apps/api/.env`
   - mobile Google sign-in uses `GOOGLE_CLIENT_ID` plus optional `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, or `GOOGLE_OAUTH_AUDIENCES`
   - authenticated users can review and revoke active app sessions from `/settings`
3. Start local stack
   - `./dev.ps1`
   - or `pnpm dev:daily`
   - this starts `web`, `api`, and `worker` after middleware boot
   - the script first runs `pnpm install --frozen-lockfile`
   - after PostgreSQL becomes healthy, the script runs `pnpm db:migrate`, or falls back to non-interactive `db:push --force` when migration artifacts are not present or the local database already has tables but no Drizzle migration history
   - default local ports use the `17720` range and can be overridden in `.env`
4. Run typecheck
   - `pnpm typecheck`

## Core Commands
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- `pnpm bootstrap:local`
- `pnpm docker:dev`
- `pnpm docker:down`
- `pnpm db:generate`
- `pnpm db:migrate`

## Release Model
- Standard release path is GitHub Actions only.
- Main workflows:
  - `CI`
  - `App Release`
  - `App Rollback`
- `Bootstrap Validate`
- Runtime deploy uses prebuilt images and `docker-compose.yml`.
- Local-only overrides live in `docker-compose.dev.yml`.
- Clean-host validation uses `docker-compose.bootstrap-check.yml`.
- Local preflight rehearsal is available with `pnpm bootstrap:local`.

## Key Documents
- Project rules and operating conventions: `AGENTS.md`
- Current implementation status: `plan/implementation-status-master.md`
- Implemented release flow: `docs/release-workflows.md`
- Implemented frontend app mapping: `docs/frontend-app-implementation.md`
- Site map: `docs/site-map.md`
- Adopted technical baseline: `docs/technical-baseline.md`
- Implemented product overview: `docs/product-overview.md`
- Implemented system architecture: `docs/system-architecture.md`
- Delivery history and milestone map: `docs/delivery-history.md`
- Implemented Wiki behavior: `docs/wiki-implementation.md`
- Implemented meeting tool behavior: `docs/meeting-tool-implementation.md`
- Implemented admin behavior: `docs/admin-user-management-implementation.md`
- Deployment guide (日本語): `DEPLOYMENT.md`
- Deployment backlog: `plan/deployment.md`
- Execution backlog: `plan/todo-master.md`
- Remaining status gates: `plan/implementation-status-master.md`
- Ops runbook: `docs/ops-runbook.md`
- Implemented product overview: `docs/product-overview.md`

## Notes
- Stable repository-wide rules belong in `AGENTS.md`.
- Volatile status, backlog, and handover details belong in `plan/` or `docs/`.
