# Product Overview

Last updated: 2026-03-11

This document describes the currently implemented product shape of `corp-internal`.

## Current Product Areas
- Google SSO based internal access
- block-based Wiki
- meetings with LiveKit
- Room AI flow from summary generation to Wiki save
- admin-only KPI and permission-management backend

## Current Users
- internal users of grand2 Products
- admins who manage access and operational settings through protected backend paths

## Current Implemented Capabilities

### Wiki
- page list and detail
- page creation, update, and deletion
- block-based editing
- search across permitted content
- page-level authorization enforcement

### Meetings
- meeting list and detail
- room-oriented meeting workflow
- summary generation path tied to meeting records
- wiki save flow for generated output

### Files
- file upload metadata and protected access paths
- server-side uploader attribution

### Administration
- admin-protected backend routes
- group, membership, and page permission APIs
- access-management, KPI, and AI agent screens on the frontend

## Current Operational Shape
- web frontend in `apps/web`
- API backend in `apps/api`
- runtime deployment on GCE with Docker Compose
- release path through GitHub Actions workflows

## Known Gaps
- frontend session and role-aware UX are not yet complete
- regression test coverage still needs to reach release-grade expectations

## Related Files
- `../plan/todo-master.md`
- `../docs/frontend-app-implementation.md`
- `../docs/wiki-implementation.md`
- `../docs/meeting-tool-implementation.md`
- `../docs/admin-user-management-implementation.md`
