# Next Tasks

Last updated: 2026-03-21

This document summarizes the current follow-up areas after the `plan/` cleanup.

## Current Priorities
- release rollout hardening

## Primary Tracking Files
- release gates and open decisions: `../plan/README.md`

## Current Follow-up Themes

### Release Hardening
- run clean-host bootstrap validation successfully in both environments
- keep rollout and rollback behavior aligned with workflow-only deployment

### AITuber Motion SOTA
- Batch 1-3 + 4-A implemented (compositor, layers, LookAt, VrmAnimationController)
- remaining: Batch 4-B/C — VRMA motion clip asset generation (HY-Motion or Blender)
- see `plan/aituber-motion-sota.md`

### Backup
- `scripts/backup.sh` created, DEPLOYMENT.md updated
- remaining: failure notification (email/Slack)

## Notes
- implemented behavior should stay documented in `docs/`
- active execution state and incomplete work should stay in `plan/`
