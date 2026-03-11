# System Architecture

Last updated: 2026-03-11

This document describes the currently implemented system architecture of `corp-internal`.

## Runtime Components
- `apps/web`: Next.js frontend
- `apps/api`: Hono API
- PostgreSQL: primary database
- LiveKit: realtime meeting infrastructure
- Redis: LiveKit support service
- GCS: file/object storage
- OAuth2 Proxy: auth gateway
- Traefik: ingress and TLS termination

## Current Runtime Shape
- users access the web frontend through Traefik and OAuth2 Proxy
- the frontend talks to the backend API over protected application routes
- the API persists business data in PostgreSQL
- the API stores files in GCS
- meeting features depend on LiveKit and related services

## Current Deployment Shape
- infrastructure is managed through Terraform under `terraform/`
- runtime services are deployed with `docker-compose.yml`
- local-only overrides live in `docker-compose.dev.yml`
- release operations are executed through GitHub Actions workflows

## Current Trust Boundaries
- Google SSO identity enters through OAuth2 Proxy
- API-side auth and authz remain server-authoritative
- admin-only backend behavior is enforced on `/api/admin/*`
- resource authorization is enforced in wiki, meetings, files, and users routes

## Current Repository Topology
- `apps/web`: frontend
- `apps/api`: backend
- `packages/shared`: shared contracts
- `packages/ui`: shared UI package
- `terraform/`: infrastructure definitions
- `.github/workflows/`: release control plane

## Related Durable Docs
- `./product-overview.md`
- `./technical-baseline.md`
- `./release-workflows.md`
- `./ops-runbook.md`

## Known Gaps
- observability architecture is not yet fully documented
- rollback and recovery architecture still needs more durable operational detail
- some historical planning artifacts still need to be trimmed from `plan/`
