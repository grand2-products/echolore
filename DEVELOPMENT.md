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
   - copy `.env.example` to `.env` only if you need root orchestration overrides
   - copy `apps/api/.env.example` to `apps/api/.env`
   - copy `apps/web/.env.local.example` to `apps/web/.env.local`
   - copy `apps/worker/.env.example` to `apps/worker/.env`
3. Review compose config
   - `docker compose -f docker-compose.yml -f docker-compose.dev.yml config`
4. Start local services
   - `./dev.ps1`
5. Verify API health
   - `curl http://localhost:17721/health`

## Local Runtime
- Web: `http://localhost:17720`
- API: `http://localhost:17721`
- Auth: Auth.js sessions managed by API at `http://localhost:17721/api/auth/*`
- LiveKit: `http://localhost:17722`
- PostgreSQL: `localhost:17724`

## Development Model
- Daily Windows workflow:
  - `./dev.ps1`
  - or `pnpm dev:daily`
- `dev.ps1` starts middleware (`db`, `valkey`, `livekit`) in Docker and then runs `web`, `api`, and `worker` through Turborepo in the current shell.
- `dev.ps1` begins with `pnpm install --frozen-lockfile` so workspace dependencies are aligned before any app starts.
- After PostgreSQL becomes healthy, `dev.ps1` applies the schema before starting app processes. It prefers `pnpm db:migrate`, falls back to `db:push --force` when Drizzle migration artifacts are not present in `apps/api/drizzle/meta/_journal.json`, and also uses that `db:push --force` path when the local database already has application tables but no `__drizzle_migrations` history table.
- Turborepo uses `stream` UI so terminal output stays copyable in regular shells.
- `dev.ps1` only loads root `.env` for orchestration overrides such as shared local ports.
- Each app dev script loads its own `.env` and `.env.local` via `dotenv-cli`.
- The default local ports are `17720`-series values and can be overridden in root `.env` for middleware or in the app-specific env files for app processes.
- Keep the app env files explicit. If you change `WEB_PORT`, `API_PORT`, `DB_PORT`, or `LIVEKIT_PORT`, also update related localhost URL values such as `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, `ROOM_AI_API_BASE_URL`, `LIVEKIT_HOST`, and `DATABASE_URL` in the same app env file.
- `dev.ps1` is orchestration only. It does not rewrite app connection targets before `turbo run dev`.
- App branding can be overridden in `apps/api/.env` and `apps/web/.env.local` via `APP_TITLE`, `NEXT_PUBLIC_APP_TITLE`, and `NEXT_PUBLIC_APP_TAGLINE`.
- Password registration and sign-in are available at `/login`.
- Registration is open only when no users exist in the database. The first registered user (password or Google SSO) is automatically promoted to `admin`. After that, self-registration is closed and new users must be added by an admin.
- Local development writes email verification links to the API log. `APP_BASE_URL` in `apps/api/.env` controls the generated verification URL.
- Shared environments can send verification mail through Resend by setting `RESEND_API_KEY` and `RESEND_FROM`.
- If Resend is not configured, the API falls back to SMTP via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`.
- Mobile Google sign-in validates ID tokens against `GOOGLE_CLIENT_ID` and any additional audiences in `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, or `GOOGLE_OAUTH_AUDIENCES`.
- Mobile clients can use `/api/auth/token`, `/api/auth/token/google`, `/api/auth/token/refresh`, and `/api/auth/token/revoke` with bearer access tokens and rotating refresh tokens.
- Authenticated users can review and revoke active app sessions from `/settings`.
- If Docker Desktop is not running, start it first or use `./dev.ps1 -SkipDocker` to launch only the app processes.
- Use `-SkipWorker` only when you intentionally want to exclude the worker from daily development.
- `docker-compose.yml` is the runtime-oriented base compose file.
- `docker-compose.dev.yml` is the local override for source-based development.
- `pnpm docker:dev` runs the API with `tsx watch` and the web app with `next dev --turbopack`.
- The dev compose stack bind-mounts the repository into the containers, so file changes should live reload without rebuilding the images.
- On first boot, the dev containers run `pnpm install --frozen-lockfile` inside the container before starting the watch process.
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
- `TEXT_GENERATION_PROVIDER` selects the LLM backend for the AI agent (`vertex-ai` or `zhipu`; defaults to `vertex-ai`).
- `ZHIPU_API_KEY` is the API key for Z.ai GLM-5 when `TEXT_GENERATION_PROVIDER=zhipu`.
- `ZHIPU_TEXT_MODEL` overrides the default Z.ai model name (optional).

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
