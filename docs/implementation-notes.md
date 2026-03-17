# Implementation Notes

Last updated: 2026-03-16

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
- `docs/site-map.md`
- `docs/observability-architecture.md`
- `docs/rollback-recovery-architecture.md`
- `docs/architecture-review-2026-03-11.md`
- `docs/next-tasks.md`
- `DEPLOYMENT.md`

## Current Implementation Notes
- backend routes are consolidated under `apps/api/src/index.ts`
- frontend API access is centralized in `apps/web/lib/api.ts`
- release flow is workflow-driven and uses prebuilt images
- runtime deployment and local development use separate compose entrypoints
- API error handling supports both middleware and wrapper styles via `apps/api/src/lib/api-error.ts`
- shared contracts in `packages/shared/src/contracts/index.ts` include admin DTOs and realtime transcript DTOs used by both `apps/api` and `apps/web`
- admin route responses are mapped to shared DTOs in `apps/api/src/routes/admin/dto.ts`
- user creation no longer accepts client-provided `id`; server assigns `user_${crypto.randomUUID()}` in `apps/api/src/routes/users.ts`
- AITuber character avatars now support VRM upload flow: backend stores uploaded VRM via StorageProvider and links it by file ID (`avatarFileId`) while preserving `avatarUrl` compatibility, with character responses resolving uploaded avatars to `/api/files/:id/download`.

## Ongoing Cleanup Rule
- old plan files that mainly describe implemented reality should be reduced or replaced with pointers to `docs/`
- remaining plan files should focus on gaps, next decisions, and backlog state

## Related Planning Files
- `../plan/README.md`
