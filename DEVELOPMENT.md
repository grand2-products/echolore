# Development Guide

Detailed local development guide for `corp-internal`.

Repository-wide stable rules live in `AGENTS.md`.
High-level project overview lives in `README.md`.

## Prerequisites
- Node.js `>= 22`
- pnpm `>= 9`
- Docker with Compose

## First-Time Setup
1. Install dependencies
   - `pnpm install`
2. Create local env file
   - copy `.env.example` to `.env`
3. Review compose config
   - `docker compose -f docker-compose.yml -f docker-compose.dev.yml config`
4. Start local services
   - `pnpm docker:dev`
5. Verify API health
   - `curl http://localhost:3001/health`

## Local Runtime
- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- OAuth2 Proxy: `http://localhost:4180`
- LiveKit: `http://localhost:7880`
- PostgreSQL: `localhost:5432`

## Development Model
- `docker-compose.yml` is the runtime-oriented base compose file.
- `docker-compose.dev.yml` is the local override for source-based development.
- Standard local stack command:
  - `pnpm docker:dev`
- Stop local stack:
  - `pnpm docker:down`
- Tail logs:
  - `pnpm docker:logs`

## Main Commands
- Dev tasks
  - `pnpm dev`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm lint:fix`
  - `pnpm format`
  - `pnpm typecheck`
  - `pnpm test`
- Database
  - `pnpm db:generate`
  - `pnpm db:migrate`
  - `pnpm db:push`
  - `pnpm db:studio`

## Database Workflow
- Schema source: `apps/api/src/db/schema.ts`
- Use `pnpm db:generate` when creating migrations.
- Use `pnpm db:migrate` when applying migrations.
- Use `pnpm db:push` only when that workflow is intentionally chosen.
- When schema changes affect business entities, review:
  - shared contracts in `packages/shared`
  - API route behavior
  - authorization impact

## Verification Expectations
- Minimum expected check after code changes:
  - `pnpm typecheck`
- Additional checks depending on the change:
  - `pnpm lint`
  - `pnpm test`
  - local compose health verification
- For auth, authz, workflow, or infra changes, also verify the relevant runtime path and document updates.

## Environment Notes
- Local env values start from `.env.example`.
- Secrets must not be committed.
- Runtime release variables such as `API_IMAGE` and `WEB_IMAGE` are injected by workflows, not set manually for standard local development.

## Release and Infra Notes
- Standard release path is GitHub Actions only.
- Do not use `DEVELOPMENT.md` as the source of truth for deployment behavior.
- Deployment and release references:
  - `docs/release-workflows.md`
  - `plan/deployment.md`
  - `docs/ops-runbook.md`
  - `.github/workflows/`

## Where To Update Docs
- Stable repo-wide rules:
  - `AGENTS.md`
- Project status and backlog:
  - `plan/`
- Operational procedures:
  - `docs/`
- Developer setup and local workflow:
  - `DEVELOPMENT.md`

## Related Documents
- `README.md`
- `AGENTS.md`
- `plan/implementation-status-master.md`
- `plan/deployment.md`
- `docs/ops-runbook.md`
