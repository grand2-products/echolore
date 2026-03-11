# corp-internal

Internal collaboration platform for grand2 Products.

## Overview
- Google SSO based access
- Block-based Wiki
- Meetings with LiveKit
- Room AI flow from transcript to summary to Wiki

## Monorepo
- `apps/web`: Next.js frontend
- `apps/api`: Hono API
- `packages/shared`: shared contracts and DTOs
- `packages/ui`: shared UI package
- `terraform/`: infrastructure for `dev` and `prod`

## Runtime Stack
- Web: Next.js
- API: Hono + Drizzle ORM
- DB: PostgreSQL
- Realtime: LiveKit
- Cache/broker: Valkey
- Auth gateway: OAuth2 Proxy
- Infra baseline: GCE + GCS + Docker Compose

## Local Development
1. Install dependencies
   - `pnpm install`
2. Prepare environment
   - copy `.env.example` to `.env`
3. Start local stack
   - `./dev.ps1`
   - or `pnpm dev:daily`
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
  - `Terraform`
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
- Deployment backlog: `plan/deployment.md`
- Execution backlog: `plan/todo-master.md`
- Remaining status gates: `plan/implementation-status-master.md`
- Ops runbook: `docs/ops-runbook.md`
- Implemented product overview: `docs/product-overview.md`

## Notes
- Stable repository-wide rules belong in `AGENTS.md`.
- Volatile status, backlog, and handover details belong in `plan/` or `docs/`.
