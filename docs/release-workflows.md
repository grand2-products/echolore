# Release Workflows

Last updated: 2026-03-13

This document describes the currently implemented release flow.

## Release Model
- Standard release path is GitHub Actions only.
- Human operators do not deploy by SSH as the primary path.
- Application rollout runs in `App Release`.
- Workflow-based rollback runs in `App Rollback`.
- Clean-host bootstrap validation runs in `Bootstrap Validate`.
- Host-side workflow steps are implemented through `scripts/release/*` to keep deploy, rollback, and bootstrap validation aligned.
- VPS initial setup is a one-time operation using `scripts/setup/vps-init.sh`.

## Workflows

### CI
- File: `.github/workflows/ci.yml`
- Responsibility:
  - lint
  - typecheck
  - build
  - test
- Trigger:
  - `push` on `develop` and `main`
  - `pull_request` against `develop` and `main`
- CI is a validation gate only.

### App Release
- File: `.github/workflows/app-release.yml`
- Responsibility:
  - build and push API/Web images to GHCR
  - write runtime `.env`
  - preserve previous runtime `.env` as rollback input on host
  - copy compose/runtime files to host via SSH
  - execute `scripts/release/remote-runtime-apply.sh` on the host
  - `docker compose config`
  - `docker compose pull`
  - start DB and run SQL migrations (Kysely migrator)
  - `docker compose up -d --remove-orphans`
  - `docker compose ps`
  - API host health verification
  - in-container web health verification
- Automatic trigger:
  - `workflow_run` after successful `CI`
- Manual trigger:
  - `workflow_dispatch`
- Sequencing:
  - On `main` push, `release-prod` runs after `release-dev` succeeds
  - On `workflow_dispatch`, the selected environment runs independently

### App Rollback
- File: `.github/workflows/app-rollback.yml`
- Responsibility:
  - accept immutable `API_IMAGE` and `WEB_IMAGE` inputs
  - write rollback `.env`
  - execute `scripts/release/remote-runtime-apply.sh` on the host
  - roll runtime back through `docker compose pull` and `up -d`
  - verify API host health and in-container web health
- Trigger:
  - `workflow_dispatch`

### Bootstrap Validate
- File: `.github/workflows/bootstrap-validate.yml`
- Responsibility:
  - copy only runtime files to a temporary host directory
  - execute `scripts/release/remote-bootstrap-validate.sh` on the host
  - validate compose rendering without source tree
  - pull images and start an isolated validation stack
  - show `docker compose ps` for the isolated stack
  - verify API and web health inside that validation stack
  - tear the validation stack down
- Local preflight:
  - `pnpm bootstrap:local`
  - builds local API/web images, stages only runtime files into a temp directory, pre-pulls non-app runtime dependencies, and runs the compose bootstrap checks without a source-tree-backed runtime
- Trigger:
  - `workflow_dispatch`

## Branch Behavior

### develop
- `CI`
- `App Release` for `dev`

### main
- `CI`
- `App Release` for `dev`, then `prod` (sequential)

## Runtime Strategy
- Runtime uses prebuilt images only.
- Runtime image registry is GHCR (`ghcr.io/<owner>/<repo>/api`, `ghcr.io/<owner>/<repo>/web`).
- `docker-compose.yml` is the runtime compose file.
- `docker-compose.dev.yml` is the local-only override.
- `docker-compose.bootstrap-check.yml` is the isolated host validation compose file.
- Release workflow injects:
  - `API_IMAGE`
  - `WEB_IMAGE`
  - `RELEASE_SHA`

## Required GitHub Secrets
- `DEPLOY_SSH_KEY` — SSH private key for deployment
- `DEPLOY_KNOWN_HOSTS` — SSH known_hosts entry for target servers
- `DEPLOY_HOST_DEV` / `DEPLOY_HOST_PROD` — target server hostname/IP
- `DEPLOY_USER_DEV` / `DEPLOY_USER_PROD` — SSH user on target server
- `RUNTIME_ENV_DEV` / `RUNTIME_ENV_PROD` — runtime environment variables block

## Operational Constraints
- Do not patch `/opt/wiki` manually except break-glass recovery.
- Do not build application containers on the host.
- Re-run the workflow instead of editing image tags or compose files by hand.
- Keep host-side rollout logic in `scripts/release/` instead of duplicating inline SSH commands across workflows.
- Treat `pnpm bootstrap:local` as a preflight rehearsal only; the remaining release gate is successful workflow execution in both `dev` and `prod`.

## Related Files
- `../AGENTS.md`
- `../DEPLOYMENT.md`
- `../docs/ops-runbook.md`
- `../docs/rollback-recovery-architecture.md`
