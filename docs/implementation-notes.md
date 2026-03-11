# Implementation Notes

Last updated: 2026-03-11

This document captures durable implementation notes that do not belong in short-term planning files.

## Documentation Split
- implemented product and system descriptions belong in `docs/`
- temporary planning, execution tracking, and open decisions belong in `plan/`
- when implementation becomes durable, move the explanation from `plan/` to `docs/` and shrink the original plan file

## Current Durable References
- `docs/product-overview.md`
- `docs/system-architecture.md`
- `docs/technical-baseline.md`
- `docs/delivery-history.md`
- `docs/frontend-app-implementation.md`
- `docs/wiki-implementation.md`
- `docs/meeting-tool-implementation.md`
- `docs/admin-user-management-implementation.md`
- `docs/release-workflows.md`
- `docs/ops-runbook.md`

## Current Implementation Notes
- backend routes are consolidated under `apps/api/src/index.ts`
- frontend API access is centralized in `apps/web/lib/api.ts`
- release flow is workflow-driven and uses prebuilt images
- runtime deployment and local development use separate compose entrypoints

## Ongoing Cleanup Rule
- old plan files that mainly describe implemented reality should be reduced or replaced with pointers to `docs/`
- remaining plan files should focus on gaps, next decisions, and backlog state

## Related Planning Files
- `plan/implementation-status-master.md`
- `plan/todo-master.md`
- `plan/deployment.md`
- `plan/implementation-status-master.md`
- `plan/todo-master.md`
- `plan/deployment.md`
