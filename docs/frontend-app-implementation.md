# Frontend App Implementation

Last updated: 2026-03-11

This document describes the currently implemented frontend app structure in `apps/web`.

## Current Scope
- App Router based Next.js frontend
- Main screens for Wiki, Meetings, Search, and Admin KPI
- Shared API client in `apps/web/lib/api.ts`
- Shared layout components in `apps/web/components/layout`

## Implemented Route Groups

### Main App
- `/`: top page
- `/(main)`: authenticated shell
- `/wiki`: wiki list
- `/wiki/[id]`: wiki detail
- `/wiki/new`: wiki creation
- `/search`: wiki search
- `/meetings`: meetings list
- `/meetings/[id]`: meeting room
- `/meetings/coworking`: shared coworking room
- `/admin/kpi`: admin KPI screen
- `/admin/agents`: admin AI agent management

## Current Frontend Structure
- `apps/web/app`: App Router screens
- `apps/web/components/wiki`: wiki UI
- `apps/web/components/meetings`: meetings UI
- `apps/web/components/layout`: shared shell
- `apps/web/lib/api.ts`: centralized API client

## Implemented Integration Pattern
- frontend calls backend APIs through `fetchApi`
- cookie-based session transport is enabled with `credentials: "include"`
- wiki, meetings, and search screens use the shared API client

## Known Gaps
- frontend main layout session state is derived from `/api/auth/me`; deeper screen-level user hydration is still partial
- admin frontend is limited to KPI and does not yet cover groups, memberships, or page permissions
- dedicated sitemap and screen inventory should be kept in `docs/site-map.md`

## Related Files
- `../plan/todo-master.md`
- `../docs/site-map.md`
- `../docs/wiki-implementation.md`
- `../docs/meeting-tool-implementation.md`
- `../docs/admin-user-management-implementation.md`
