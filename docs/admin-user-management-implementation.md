# Admin User Management Implementation

Last updated: 2026-03-11

This document describes the currently implemented admin user management behavior.

## Current Scope
- Admin group management API exists
- Group membership management API exists
- Page permission management API exists
- Admin KPI screen exists
- Admin APIs are protected by admin-only access control

## Implemented Backend
- Admin routes: `apps/api/src/routes/admin.ts`
- Auth/session: `apps/api/src/lib/auth.ts`
- Authorization: `apps/api/src/lib/authorization.ts`
- Schema: `apps/api/src/db/schema.ts`

## Implemented Data Model
- `user_groups`
- `user_group_memberships`
- `page_permissions`
- `page_inheritance`

## Implemented Behaviors

### Groups
- list groups
- create group
- get group detail
- update group
- delete group

### Memberships
- list group members
- add members to group
- remove member from group
- update user group assignments

### Page Permissions
- get page permissions
- replace page permissions
- delete page permission entry
- get inheritance setting
- update inheritance setting

### Security
- `/api/admin/*` is behind admin role enforcement
- admin write actions emit audit logs
- page permission decisions are used by Wiki authorization paths

## Current Frontend
- KPI screen: `apps/web/app/(main)/admin/kpi/page.tsx`
- Access management screen: `apps/web/app/(main)/admin/access/page.tsx`
- AI agent screen: `apps/web/app/(main)/admin/agents/page.tsx`

## Known Gaps
- broader regression test coverage is missing
- operational guidance should stay in `docs/`, not in planning docs

## Related Files
- `../plan/todo-master.md`
- `../plan/implementation-status-master.md`
