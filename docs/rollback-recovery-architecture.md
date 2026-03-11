# Rollback Recovery Architecture

Last updated: 2026-03-12

This document describes the current rollback and recovery shape for `corp-internal`.

## Primary Rollback Path
- standard rollback is workflow-driven through `App Rollback`
- rollback uses immutable `API_IMAGE` and `WEB_IMAGE` inputs
- host-side apply logic is shared through `scripts/release/remote-runtime-apply.sh`

## Runtime Recovery Model
- runtime `.env` is written per release
- previous runtime `.env` is preserved on host as rollback input
- runtime recovery reuses `docker compose pull` and `docker compose up -d --remove-orphans`

## Validation Model
- release validates API and web health after rollout
- rollback validates API and web health after recovery
- bootstrap validation exercises compose rendering and isolated startup without source tree

## Break-Glass Boundary
- SSH is break-glass only
- manual host edits do not replace the workflow path as the durable fix
- if break-glass recovery is used, operators should return to workflow-managed state immediately after stabilization

## Known Limits
- clean-host bootstrap success still needs to be proven in both environments
- rollback still assumes image tags are known and available
- no separate disaster-recovery topology is documented beyond single-host runtime recovery

## Related Files
- `./release-workflows.md`
- `./ops-runbook.md`
- `../plan/deployment.md`
