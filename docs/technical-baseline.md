# Technical Baseline

Last updated: 2026-03-11

This document records the currently adopted technical baseline for the repository.

## Runtime Baseline
- Web: Next.js
- API: Hono
- ORM: Drizzle ORM
- Database: PostgreSQL
- Realtime: LiveKit
- Cache/broker: Redis
- Auth gateway: OAuth2 Proxy
- Infra baseline: GCE + GCS + Docker Compose

## Repository Baseline
- package manager: `pnpm`
- monorepo task runner: Turborepo
- shared contracts: `packages/shared`
- shared UI package: `packages/ui`

## Delivery Baseline
- release path is GitHub Actions workflow only
- infra changes are expressed in Terraform
- runtime deploy uses prebuilt images
- `docker-compose.yml` is the runtime compose
- `docker-compose.dev.yml` is the local development override

## Current External Platform Choices
- cloud platform: Google Cloud Platform
- object storage: Google Cloud Storage
- authentication provider: Google SSO through OAuth2 Proxy
- AI summary path: Vertex AI
- speech/transcript path: Google Cloud Speech-to-Text

## Current Constraints
- frontend and API contracts should stay aligned through `packages/shared`
- auth and authz remain server-authoritative
- local development and runtime deployment use different compose entrypoints
- Terraform-managed runtime hosts use explicit per-environment VPC/subnet/firewall resources
- GCE instance service accounts use narrowed scopes instead of `cloud-platform`
- Runtime service accounts and bucket object access are managed in Terraform per environment

## Known Gaps
- regression test coverage is still below release-grade expectations
- some older planning documents still contain architecture intent that should be reduced over time

## Related Files
- `../plan/implementation-status-master.md`
- `../docs/release-workflows.md`
- `../docs/ops-runbook.md`
- `../AGENTS.md`
