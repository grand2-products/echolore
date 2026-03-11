# Observability Architecture

Last updated: 2026-03-12

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

## Current Monitoring Shape
- workflow release validates API and web reachability after rollout
- bootstrap validation checks isolated runtime startup without source tree
- ops triage uses compose logs and KPI totals together
- warning and critical thresholds are documented in `docs/ops-runbook.md`

## Known Limits
- no separate metrics backend is documented yet
- alert delivery transport is not yet described as durable infrastructure
- realtime transcript/media quality metrics are still minimal

## Related Files
- `./ops-runbook.md`
- `./release-workflows.md`
- `./system-architecture.md`
