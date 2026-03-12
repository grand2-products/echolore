# System Architecture

Last updated: 2026-03-12

This document describes the currently implemented system architecture of `corp-internal`.

## Runtime Components
- `apps/web`: Next.js frontend
- `apps/api`: Hono API
- PostgreSQL: primary database
- LiveKit: realtime meeting infrastructure
- Valkey: LiveKit support service
- GCS: file/object storage
- OAuth2 Proxy: primary auth gateway
- Traefik: ingress and TLS termination

## Current Runtime Shape
- users access the web frontend through Traefik and OAuth2 Proxy for browser Google SSO, or through API-issued access tokens after email verification or Google mobile token exchange
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
- mobile Google identity can also enter directly through API-side ID token verification
- password identities and verification tokens are issued and verified by the API
- `users.email` is the canonical external identity key across Google SSO and password auth
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
- `terraform/`: infrastructure definitions
- `.github/workflows/`: release control plane

## Related Durable Docs
- `./product-overview.md`
- `./technical-baseline.md`
- `./release-workflows.md`
- `./ops-runbook.md`
- `./observability-architecture.md`
- `./rollback-recovery-architecture.md`

## Known Gaps
- some historical planning artifacts still need to be trimmed from `plan/`
