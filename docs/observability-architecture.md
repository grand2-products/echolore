# Observability Architecture

Last updated: 2026-03-13

This document describes the currently implemented observability baseline for `corp-internal`.

## Signals
- API health endpoint for liveness checks
- web readiness validation in release workflows
- audit-log based security signals
- admin KPI overview for operational review

## Current Sources
- application health: `/health` on API
- security metrics: `/api/admin/metrics/overview`
- audit events:
  - `auth.rejected`
  - `authz.denied`
  - resource-view and pipeline audit events
- runtime container status: `docker compose ps`
- Traefik access logs: routing errors, TLS handshake failures
- TLS certificate status: Let's Encrypt auto-renewal via Traefik (90-day cycle)

## Current Monitoring Shape
- workflow release validates API and web reachability after rollout
- bootstrap validation checks isolated runtime startup without source tree
- ops triage uses compose logs and KPI totals together
- warning and critical thresholds are documented in `docs/ops-runbook.md`

## Known Limits
- no separate metrics backend is documented yet
- alert delivery transport is not yet described as durable infrastructure
- TLS certificate expiry alerting relies on Traefik auto-renewal; no external monitoring yet
- realtime transcript/media quality metrics are still minimal

## Related Files
- `./ops-runbook.md`
- `./release-workflows.md`
- `./system-architecture.md`
