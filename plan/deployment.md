# Deployment Plan

Last updated: 2026-03-11

`plan/deployment.md` tracks remaining deployment work.
For the currently implemented release flow, see `docs/release-workflows.md`.

## Current State Summary
- GitHub Actions only release path is implemented
- Runtime uses prebuilt images
- Workflow split exists:
  - `CI`
  - `Terraform`
  - `App Release`
- Host-side rollout and bootstrap validation steps are script-backed from `scripts/release/`

## Remaining Gaps
- [x] Add rollback workflow with previous immutable image tag input
- [x] Add web readiness check in addition to API health
- [x] Add clean-host bootstrap validation workflow
- [ ] Run clean-host bootstrap validation successfully in both environments
- [ ] Decide whether to standardize on Artifact Registry or keep GCR explicitly
- [x] Reduce workflow drift by centralizing host-side release/bootstrap logic

## Next Decisions
- image registry standardization
- rollback workflow interface
- clean-host validation procedure
- production-safe health checks beyond API-only validation

## References
- Implemented release flow: `../docs/release-workflows.md`
- Ops procedure: `../docs/ops-runbook.md`
- Status tracking: `./implementation-status-master.md`
- Backlog: `./todo-master.md`
