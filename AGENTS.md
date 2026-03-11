# AGENTS.md

## Project
- Repository: `corp-internal`
- Purpose: internal collaboration platform for grand2 Products
- Main domains:
  - Google SSO based access
  - block-based Wiki
  - Meetings with LiveKit
  - Room AI flow from transcript to summary to Wiki

## Monorepo Structure
- `apps/web`: Next.js frontend
- `apps/api`: Hono API
- `packages/shared`: shared contracts/types
- `packages/ui`: shared UI package
- `terraform/`: infrastructure definitions for `dev` and `prod`
- `plan/`: planning and architecture documents
- `docs/`: operational notes and runbooks

## Runtime Architecture
- Web: Next.js
- API: Hono + Drizzle ORM
- Database: PostgreSQL
- Realtime: LiveKit
- Cache/broker: Valkey
- Auth gateway: OAuth2 Proxy
- Infra baseline: GCE + GCS + Docker Compose
- Network baseline: explicit per-environment VPC/subnet/firewall in Terraform

## Release Policy
- Release path is GitHub Actions workflow only.
- Do not treat manual SSH deployment as the standard path.
- Main workflows:
  - `CI`: lint, typecheck, build, test
  - `Terraform`: infra validate/plan/apply
  - `App Release`: image build/push and host rollout
  - `App Rollback`: workflow-driven rollback
  - `Bootstrap Validate`: isolated clean-host runtime validation
- Runtime deploy uses prebuilt images, not host-side source builds.

## Branch Policy
- `develop` is the integration branch for `dev`.
- `main` is the release branch for `prod`.
- Expected automatic path:
  - `develop` -> `CI` -> `Terraform` to `dev` -> `App Release` to `dev`
  - `main` -> `CI` -> `Terraform` to `dev` and `prod` -> `App Release` to `dev` and `prod`

## Compose Policy
- `docker-compose.yml`: runtime/staging/production compose
- `docker-compose.dev.yml`: local development override
- `docker-compose.bootstrap-check.yml`: isolated host bootstrap validation compose
- `scripts/release/`: host-side workflow scripts for rollout, rollback, and bootstrap validation
- Runtime services use `API_IMAGE` and `WEB_IMAGE`.

## Environment and Secret Naming
- Environment split:
  - `dev`
  - `prod`
- Core release/runtime variables:
  - `API_IMAGE`
  - `WEB_IMAGE`
  - `RELEASE_SHA`
- Core GitHub Secrets:
  - `TF_STATE_BUCKET`
  - `GCP_SA_KEY`
  - `GCP_PROJECT_ID_DEV`
  - `GCP_PROJECT_ID_PROD`
  - `GCE_ENV_FILE_DEV`
  - `GCE_ENV_FILE_PROD`

## Naming Conventions
- Environment-specific names should end with `_DEV` or `_PROD` for GitHub Secrets.
- Runtime env vars should stay uppercase snake case.
- Shared DTO and contract types should use explicit suffixes such as `Dto`, `Request`, `Response`.
- Workflow names should reflect responsibility directly:
  - `CI`
  - `Terraform`
  - `App Release`
- Plan and status documents should prefer explicit names over temporary notes.

## Auth and Authorization Principles
- API identity must be server-authoritative.
- Do not accept actor identity such as `authorId`, `creatorId`, or `uploaderId` from clients for business writes.
- Authorization is enforced in API routes for wiki, meetings, files, and users.
- Frontend auth state still needs to be sourced from real session user consistently.

## Security-Sensitive Paths
- `apps/api/src/lib/auth.ts`
- `apps/api/src/lib/authorization.ts`
- `apps/api/src/routes/wiki.ts`
- `apps/api/src/routes/meetings.ts`
- `apps/api/src/routes/files.ts`
- `apps/api/src/routes/users.ts`
- `.github/workflows/`
- `docker-compose.yml`
- `terraform/`
- Changes in these areas should be reviewed for trust boundary, privilege scope, and rollback impact.

## API Contract Rules
- Shared API contracts live in `packages/shared`.
- Treat `packages/shared` as the source of truth for DTOs and request/response shapes.
- When changing API payloads, update API and web in the same change.
- Avoid duplicating contract types inside `apps/api` or `apps/web` unless they are strictly local UI/helper types.
- For business-write APIs, do not reintroduce client-owned actor fields into shared contracts.

## Testing Rules
- `pnpm typecheck` is the minimum required verification for code changes.
- `pnpm test` is expected to become a release gate; add tests instead of weakening the gate.
- Any auth/authz change should add or update a regression test.
- Any contract change should be verified on both API and web sides.
- If tests do not exist for a touched critical path, note the gap explicitly and prefer adding the smallest useful test.

## Database Rules
- Database schema is defined in `apps/api/src/db/schema.ts`.
- Schema changes should keep Drizzle artifacts and runtime code aligned.
- Use:
  - `pnpm db:generate` for migration generation
  - `pnpm db:migrate` for applying migrations
  - `pnpm db:push` only when that workflow is intentionally chosen
- When changing schema for shared business entities, review API contracts and authorization impact together.
- Multi-step writes that must stay consistent should prefer DB transactions.

## Frontend Rules
- Frontend code lives in `apps/web`.
- Prefer shared contracts and the centralized client in `apps/web/lib/api.ts`.
- Avoid ad hoc `fetch` calls when the API client already covers the endpoint.
- Session-aware UI should converge on real session user data, not mock identity.
- When changing protected screens, verify unauthorized and error states as well as success states.

## Security Rules
- Business write APIs must derive actor identity from authenticated session context.
- Admin-only behavior must be enforced on the server, not only hidden in UI.
- Secrets belong in GitHub Secrets or runtime env injection, never committed files.
- Break-glass host operations are exceptions and should not replace workflow-based release behavior.
- Changes to auth, authz, release, or infra should be reviewed with rollback and trust-boundary impact in mind.
- GCE hosts should use explicit VPC/subnet resources and minimal service-account scopes instead of default network or `cloud-platform`.
- Runtime service accounts and bucket object access should be Terraform-managed per environment.

## Code Review Focus
- Prioritize:
  - authn/authz regressions
  - privilege escalation risk
  - client/server contract drift
  - release-flow breakage
  - data consistency issues in multi-step writes
- For workflow or infra changes, review trigger conditions, branch targeting, secrets usage, and rollback path.
- For API changes, review both input ownership and resource authorization, not only type correctness.

## Infra Change Rules
- Infra changes should be expressed in `terraform/` first.
- Do not rely on manual host mutation as the durable fix.
- If release/runtime behavior changes, update these together:
  - `.github/workflows/`
  - `scripts/release/`
  - `docker-compose.yml`
  - `plan/deployment.md`
  - `docs/ops-runbook.md`
  - `AGENTS.md`

## Documentation Sync Rules
- `AGENTS.md` stores stable rules, conventions, and operating assumptions.
- `plan/` stores only temporary plans, open decisions, incomplete work, acceptance criteria, and execution backlog.
- `docs/` stores implemented behavior, operational procedures, and implementation notes.
- If a change affects team defaults or repository-wide behavior, update `AGENTS.md` in the same change.
- Do not use `plan/` for implemented system overviews, implemented feature descriptions, current-state summaries, or durable operational explanations.
- When a planned item is implemented, move the durable description out of `plan/` and into `docs/` in the same change when the behavior is now real and stable.
- If a `plan/*.md` file no longer contains meaningful incomplete work or open decisions, delete it instead of keeping a historical summary.
- If a `plan/*.md` file still has active work, shrink it to the remaining gaps, decisions, and acceptance checks only.
- Do not add or keep sections such as `Current State Summary`, `Implemented Behavior`, or similar implemented-reality mirrors in `plan/`; that material belongs in `docs/`.
- Keep `plan/` lighter over time by removing or shrinking sections that only describe already-implemented behavior.
- Maintain the repository so that:
  - `plan/` is primarily future-facing
  - `docs/` is primarily a map of implemented reality

## Decision Logging
- Durable architecture or release decisions should be reflected in:
  - `AGENTS.md` for stable repository rules
  - `docs/release-workflows.md` for implemented deployment behavior
  - `plan/deployment.md` for remaining deployment work
  - `plan/implementation-status-master.md` for remaining gates and incomplete status only
  - `plan/todo-master.md` for follow-up work
- Do not leave important operational decisions only in ad hoc chat, PR text, or temporary handover notes.
- If a previous default changes, update the old source of truth in the same change rather than adding a contradictory note elsewhere.

## Ownership Areas
- `apps/api`: backend behavior, authz enforcement, DB access
- `apps/web`: UI behavior and session-driven frontend integration
- `packages/shared`: API contract ownership boundary
- `.github/workflows/` and `terraform/`: release and infrastructure control plane
- `plan/` and `docs/`: repository operating knowledge

## Definition Of Done
- A change is not done only because code was added.
- Minimum done criteria:
  - contracts, API, and web stay aligned
  - required docs are updated when behavior changed
  - obsolete or duplicated `plan/` content is removed or reduced to remaining work only
  - `pnpm typecheck` passes
  - tests are added or the remaining gap is explicitly called out
  - release or infra changes preserve the GitHub Actions only policy
- For security-sensitive changes, done also means the trust boundary and authorization behavior were re-checked.

## Developer Commands
- Install dependencies: `pnpm install`
- Full typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Build: `pnpm build`
- Test: `pnpm test`
- Local compose up: `pnpm docker:dev`
- Local compose down: `pnpm docker:down`
- DB generate: `pnpm db:generate`
- DB migrate: `pnpm db:migrate`

## Source of Truth
- Implementation status gates: `plan/implementation-status-master.md`
- Implemented product overview: `docs/product-overview.md`
- Implemented system architecture: `docs/system-architecture.md`
- Delivery history: `docs/delivery-history.md`
- Implemented release flow: `docs/release-workflows.md`
- Implemented frontend app mapping: `docs/frontend-app-implementation.md`
- Adopted technical baseline: `docs/technical-baseline.md`
- Deployment backlog: `plan/deployment.md`
- Execution backlog: `plan/todo-master.md`
- Ops procedure: `docs/ops-runbook.md`

## Working Rules
- Prefer updating `AGENTS.md` only for stable project rules and conventions.
- Put volatile task lists and one-off handover notes in `plan/` or `docs/`, not here.
- When implemented deployment behavior changes, update `AGENTS.md`, `docs/release-workflows.md`, and related workflows together.
- When deployment backlog changes, update `plan/deployment.md`.
- When branch/release behavior changes, update both `AGENTS.md` and workflow files in `.github/workflows/`.
- If implementation is complete and the explanation is durable, put it in `docs/`, not `plan/`.
- Before merging documentation-heavy changes, check whether any `plan/*.md` file became implementation history and should be deleted or trimmed.
