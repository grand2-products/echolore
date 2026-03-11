# Delivery History

Last updated: 2026-03-11

This document records the implementation history and milestone view that were previously kept in planning timeline notes.

## Historical Shape
- the repository started from a broad product plan covering wiki, meetings, authentication, infra, and AI features
- implementation progressed unevenly, with core API and UI capability landing before release hardening and test coverage
- the current source of truth for release readiness is `plan/implementation-status-master.md`

## Implemented Milestone Pattern

### Foundation
- monorepo structure exists
- API and web applications exist
- Terraform and workflow-based release paths exist

### Product Core
- wiki CRUD and search are implemented
- meetings flows are implemented in MVP form
- files and admin APIs are implemented

### Release Control
- release direction is GitHub Actions workflow only
- runtime deployment uses prebuilt images and runtime compose

## Current Remaining Milestones
- release hardening
- frontend auth/session normalization
- regression and contract test coverage

## Current Milestone Map
- foundation: substantially implemented
- product core: substantially implemented
- release readiness: partial

## Related Files
- `../plan/todo-master.md`
- `../plan/implementation-status-master.md`
- `../plan/todo-master.md`
- `../docs/release-workflows.md`
