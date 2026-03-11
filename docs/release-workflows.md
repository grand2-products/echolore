# Release Workflows

Last updated: 2026-03-11

This document describes the currently implemented release flow.

## Release Model
- Standard release path is GitHub Actions only.
- Human operators do not deploy by SSH as the primary path.
- Infrastructure changes run in `Terraform`.
- Application rollout runs in `App Release`.
- Workflow-based rollback runs in `App Rollback`.
- Clean-host bootstrap validation runs in `Bootstrap Validate`.
- Host-side workflow steps are implemented through `scripts/release/*` to keep deploy, rollback, and bootstrap validation aligned.

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

### Terraform
- File: `.github/workflows/terraform.yml`
- Responsibility:
  - `terraform fmt -check`
  - `terraform validate`
  - `terraform plan`
  - `terraform apply`
- Automatic trigger:
  - `pull_request`
  - `workflow_run` after successful `CI`
- Manual trigger:
  - `workflow_dispatch`

### App Release
- File: `.github/workflows/app-release.yml`
- Responsibility:
  - build and push API/Web images
  - write runtime `.env`
  - preserve previous runtime `.env` as rollback input on host
  - copy compose/runtime files to host
  - execute `scripts/release/remote-runtime-apply.sh` on the host
  - `docker compose config`
  - `docker compose pull`
  - `docker compose up -d --remove-orphans`
  - `docker compose ps`
  - API and web health verification
- Automatic trigger:
  - `workflow_run` after successful `Terraform`
- Manual trigger:
  - `workflow_dispatch`

### App Rollback
- File: `.github/workflows/app-rollback.yml`
- Responsibility:
  - accept immutable `API_IMAGE` and `WEB_IMAGE` inputs
  - write rollback `.env`
  - execute `scripts/release/remote-runtime-apply.sh` on the host
  - roll runtime back through `docker compose pull` and `up -d`
  - verify API and web health
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
- Trigger:
  - `workflow_dispatch`

## Branch Behavior

### develop
- `CI`
- `Terraform` for `dev`
- `App Release` for `dev`

### main
- `CI`
- `Terraform` for `dev`
- `Terraform` for `prod`
- `App Release` for `dev`
- `App Release` for `prod`

## Runtime Strategy
- Runtime uses prebuilt images only.
- `docker-compose.yml` is the runtime compose file.
- `docker-compose.dev.yml` is the local-only override.
- `docker-compose.bootstrap-check.yml` is the isolated host validation compose file.
- Release workflow injects:
  - `API_IMAGE`
  - `WEB_IMAGE`
  - `RELEASE_SHA`

## Required GitHub Secrets
- `TF_STATE_BUCKET`
- `GCP_SA_KEY`
- `GCP_PROJECT_ID_DEV`
- `GCP_PROJECT_ID_PROD`
- `GCE_ENV_FILE_DEV`
- `GCE_ENV_FILE_PROD`

## Operational Constraints
- Do not patch `/opt/wiki` manually except break-glass recovery.
- Do not build application containers on the host.
- Re-run the workflow instead of editing image tags or compose files by hand.
- Keep host-side rollout logic in `scripts/release/` instead of duplicating inline SSH commands across workflows.

## Related Files
- `../AGENTS.md`
- `../plan/deployment.md`
- `../docs/ops-runbook.md`
